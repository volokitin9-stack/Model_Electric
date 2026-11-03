#!/usr/bin/env python3
"""Агент поставок: читает выгрузки переписки WeChat с поставщиками, обновляет статусы
позиций в supply/orders.csv, ведёт историю в supply/events.csv, формирует supply/STATUS.md
и шлёт в Telegram сообщения об изменении статуса и напоминания о зависших поставках.

Агент только ЧИТАЕТ переписку — в WeChat ничего не отправляет.

Команды:
  python3 tools/supply_agent.py ingest   # разобрать новые файлы из wechat_inbox/
  python3 tools/supply_agent.py check    # найти зависшие поставки / неотвеченные сообщения
  python3 tools/supply_agent.py run      # ingest + check + STATUS.md (для расписания)
  python3 tools/supply_agent.py status   # только пересобрать STATUS.md
  python3 tools/supply_agent.py set ORDER_ID [PN] field=value ...   # ручная правка
  python3 tools/supply_agent.py tg-test  # проверить отправку в Telegram

Флаги: --root DIR (корень проекта), --dry-run (не слать в TG, не перемещать файлы),
       --now "YYYY-MM-DD HH:MM" (для проверки порогов на тестовых данных).

Telegram: переменные окружения TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID.
Если их нет — сообщения пишутся в supply/notifications.md.
"""
import argparse
import csv
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import sys
import urllib.parse
import urllib.request

ORDER_FIELDS = ["order_id", "supplier_id", "pn", "qty", "pay_status", "ship_status", "tracking",
                "waiting_on", "last_in", "last_out", "last_event", "updated", "next_step", "notes"]
EVENT_FIELDS = ["ts", "supplier_id", "order_id", "pn", "event", "direction", "quote", "msg_hash"]
SUPPLIER_FIELDS = ["supplier_id", "name", "wechat_names", "contact", "items", "notes"]

PAY_LABEL = {"": "—", "none": "не выставлен", "quoted": "есть цена", "invoiced": "счёт/PI получен",
             "paid": "оплачено нами", "confirmed": "оплата подтверждена"}
SHIP_LABEL = {"": "—", "none": "не начато", "production": "в производстве", "ready": "готово к отгрузке",
              "shipped": "отгружено", "delivered": "получено", "partial": "отгружено частично",
              "stock_out": "нет в наличии", "delayed": "задержка"}
WAIT_LABEL = {"supplier": "ждём поставщика", "us": "ждут НАС", "": "—", "-": "—"}

PAY_ORDER = ["", "none", "quoted", "invoiced", "paid", "confirmed"]
SHIP_ORDER = ["", "none", "production", "ready", "partial", "shipped", "delivered"]

# Ключевые слова: китайский / английский / русский. Событие -> (поле, значение)
RULES = [
    ("delivered", r"已签收|签收了|已收到货|收到货了|delivered|получили (груз|товар|посылку)|груз получен"),
    ("shipped", r"已发货|发货了|已发出|已寄出|寄出了|快递单号|运单号|物流单号|tracking|shipped|dispatched|отгруз|отправил[иа]?|трек"),
    ("partial", r"部分发货|先发一部分|分批发|partial(ly)? ship|частичн"),
    ("ready", r"货好了|已备好|备好货|货已备齐|可以发货|ready (to|for) ship|готов[ао]? к отгрузке"),
    ("production", r"生产中|在生产|安排生产|排产|已投产|in production|производств"),
    ("stock_out", r"缺货|没货|无货|没有库存|断货|out of stock|нет в наличии"),
    ("delayed", r"延迟|推迟|延期|晚几天|要晚|来不及|delay|postpone|задерж|перенос"),
    ("pay_confirmed", r"收到款|款已收到|已收到款|到账了|已到账|payment received|received (the|your) payment|оплат[ау] получил|деньги пришли"),
    ("we_paid", r"已付款|已支付|已转账|付款了|转账了|已汇款|we (have )?paid|payment (is )?(sent|done|made)|оплатил[иа]?|перевел[иа]?"),
    ("invoiced", r"形式发票|\bPI\b|发票|invoice|账户信息|银行信息|收款账户|сч[её]т на оплату|выставил[иа]? сч[её]т"),
    ("quoted", r"报价|单价|价格是|quotation|quote|price is|цена|прайс"),
]
PAY_EVENTS = {"quoted", "invoiced", "we_paid", "pay_confirmed"}
ORDER_LEVEL = {"silent", "we_owe", "unpaid", "idle"}   # напоминания одним сообщением на заказ
RULES_RE = [(name, re.compile(pat, re.I)) for name, pat in RULES]

TRACK_RE = re.compile(r"(?:单号|tracking(?: no\.?| number)?|трек(?:-номер)?)[\s:：#]*([A-Z0-9]{8,30})"
                      r"|\b(SF\d{12,15}|[A-Z]{2}\d{9}[A-Z]{2}|YT\d{14,18}|JD[A-Z0-9]{10,18})\b", re.I)
QUESTION_RE = re.compile(r"[?？]|请确认|请问|麻烦.*(确认|告诉)|please confirm|подтвердите")

DT_PAT = r"\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[ T]+\d{1,2}:\d{2}(?::\d{2})?"
HDR_NAME_DT = re.compile(rf"^(?P<name>.+?)\s+(?P<dt>{DT_PAT})\s*$")          # "张三 2026/11/1 10:23"
HDR_DT_NAME = re.compile(rf"^\[?(?P<dt>{DT_PAT})\]?\s+(?P<name>[^:：]{{1,40}})[:：]\s*(?P<text>.*)$")  # "2026-11-01 10:23 张三: текст"


# ---------------------------------------------------------------- utils
def parse_dt(s):
    s = re.sub(r"[/.]", "-", s.strip()).replace("T", " ")
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return dt.datetime.strptime(s, fmt)
        except ValueError:
            pass
    return None


def fmt_dt(d):
    return d.strftime("%Y-%m-%d %H:%M") if d else ""


def read_csv(path, fields):
    if not os.path.exists(path):
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return [{k: (r.get(k) or "") for k in fields} for r in csv.DictReader(f)]


def write_csv(path, fields, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)


def days_between(a, b):
    return (b - a).total_seconds() / 86400


# ---------------------------------------------------------------- parsing WeChat exports
def parse_txt(path):
    """Текст, скопированный из WeChat (PC: выделить сообщения -> копировать / 合并转发),
    или выгрузка вида «2026-11-01 10:23 Имя: текст»."""
    msgs, cur = [], None
    with open(path, encoding="utf-8-sig", errors="replace") as f:
        for raw in f:
            line = raw.rstrip("\n")
            m = HDR_DT_NAME.match(line)
            if m:
                cur = {"dt": parse_dt(m["dt"]), "sender": m["name"].strip(), "text": m["text"].strip()}
                msgs.append(cur)
                continue
            m = HDR_NAME_DT.match(line)
            if m and parse_dt(m["dt"]):
                cur = {"dt": parse_dt(m["dt"]), "sender": m["name"].strip(), "text": ""}
                msgs.append(cur)
                continue
            if cur is not None and line.strip():
                cur["text"] = (cur["text"] + "\n" + line.strip()).strip()
    return msgs


def parse_csv_export(path):
    """CSV из MemoTrace / WeChatMsg и похожих: StrTime, IsSender, StrContent, NickName/Remark/Sender."""
    msgs = []
    with open(path, newline="", encoding="utf-8-sig", errors="replace") as f:
        for r in csv.DictReader(f):
            low = {k.lower(): v for k, v in r.items() if k}
            t = low.get("strtime") or low.get("time") or low.get("createtime") or low.get("date") or ""
            d = parse_dt(t) if not t.isdigit() else dt.datetime.fromtimestamp(int(t))
            text = low.get("strcontent") or low.get("content") or low.get("message") or low.get("text") or ""
            is_me = (low.get("issender") or "").strip() in ("1", "true", "True")
            sender = "__me__" if is_me else (low.get("remark") or low.get("nickname") or low.get("sender")
                                             or low.get("talker") or "")
            if d and text:
                msgs.append({"dt": d, "sender": sender.strip(), "text": text.strip()})
    return msgs


# ---------------------------------------------------------------- agent
class Agent:
    def __init__(self, root, dry_run=False, now=None):
        self.root = root
        self.sd = os.path.join(root, "supply")
        self.inbox = os.path.join(root, "wechat_inbox")
        self.dry = dry_run
        self.now = now or dt.datetime.now()
        with open(os.path.join(self.sd, "config.json"), encoding="utf-8") as f:
            self.cfg = json.load(f)
        self.me = {n.lower() for n in self.cfg.get("me_names", [])} | {"__me__"}
        self.suppliers = read_csv(os.path.join(self.sd, "suppliers.csv"), SUPPLIER_FIELDS)
        self.orders = read_csv(os.path.join(self.sd, "orders.csv"), ORDER_FIELDS)
        self.events = read_csv(os.path.join(self.sd, "events.csv"), EVENT_FIELDS)
        self.seen = {e["msg_hash"] for e in self.events}
        self.notes = []          # уведомления к отправке
        self.state_path = os.path.join(self.sd, "reminders_state.json")
        try:
            with open(self.state_path, encoding="utf-8") as f:
                self.rstate = json.load(f)
        except (OSError, ValueError):
            self.rstate = {}

    # --- поставщики
    def supplier_for(self, fname, msgs):
        base = os.path.basename(fname).lower()
        for s in self.suppliers:
            if base.startswith(s["supplier_id"].lower() + "__") or base.split(".")[0] == s["supplier_id"].lower():
                return s
        names = {m["sender"].lower() for m in msgs}
        for s in self.suppliers:
            aliases = {a.strip().lower() for a in s["wechat_names"].split(";") if a.strip()}
            if aliases & names or any(a and a in base for a in aliases):
                return s
        return None

    def sup_name(self, sid):
        for s in self.suppliers:
            if s["supplier_id"] == sid:
                return s["name"] or sid
        return sid

    def open_lines(self, sid):
        return [o for o in self.orders if o["supplier_id"] == sid and o["ship_status"] != "delivered"]

    # --- разбор одного сообщения
    def classify(self, text):
        found = [name for name, rx in RULES_RE if rx.search(text)]
        # «отгрузили» и «доставлено» одновременно — оставляем более позднюю стадию
        if "delivered" in found and "shipped" in found:
            found.remove("shipped")
        return found

    def target_lines(self, sid, text):
        lines = self.open_lines(sid)
        if not lines:
            return []
        hit = [o for o in lines if o["pn"] and o["pn"].lower() in text.lower()]
        if hit:
            return hit
        hit = [o for o in lines if o["order_id"] and o["order_id"].lower() in text.lower()]
        if hit:
            return hit
        orders = {o["order_id"] for o in lines}
        if len(orders) == 1:
            return lines
        # несколько открытых заказов и в тексте не указано какой — берём самый свежий по активности
        latest = max(lines, key=lambda o: o["updated"])["order_id"]
        return [o for o in lines if o["order_id"] == latest]

    def apply(self, line, ev, msg, direction):
        old = (line["pay_status"], line["ship_status"])

        def up_pay(v):
            if PAY_ORDER.index(v) > PAY_ORDER.index(line["pay_status"] if line["pay_status"] in PAY_ORDER else ""):
                line["pay_status"] = v

        def up_ship(v):
            cur = line["ship_status"]
            if cur in ("stock_out", "delayed") or SHIP_ORDER.index(v) > SHIP_ORDER.index(cur if cur in SHIP_ORDER else ""):
                line["ship_status"] = v

        if ev == "quoted":
            up_pay("quoted")
        elif ev == "invoiced":
            up_pay("invoiced")
        elif ev == "we_paid":
            up_pay("paid")
        elif ev == "pay_confirmed":
            up_pay("confirmed")
        elif ev in ("production", "ready", "partial", "shipped", "delivered"):
            up_ship(ev)
        elif ev in ("stock_out", "delayed"):
            if line["ship_status"] not in ("shipped", "delivered"):
                line["ship_status"] = ev
        if ev in ("shipped", "partial"):
            m = TRACK_RE.search(msg["text"])
            if m:
                line["tracking"] = m.group(1) or m.group(2)
        line["last_event"] = ev
        line["updated"] = fmt_dt(msg["dt"])
        return old != (line["pay_status"], line["ship_status"])

    def ingest(self):
        files = sorted(f for f in os.listdir(self.inbox)
                       if os.path.isfile(os.path.join(self.inbox, f)) and f.lower().endswith((".txt", ".csv")))
        changes = []
        for fn in files:
            path = os.path.join(self.inbox, fn)
            msgs = parse_csv_export(path) if fn.lower().endswith(".csv") else parse_txt(path)
            msgs = [m for m in msgs if m["dt"]]
            msgs.sort(key=lambda m: m["dt"])
            sup = self.supplier_for(fn, msgs)
            if not sup:
                self.notes.append(f"❓ Файл <b>{fn}</b>: не понял, какой это поставщик. "
                                  f"Добавьте его в supply/suppliers.csv (wechat_names) или назовите файл ID__что-угодно.txt")
                continue
            sid = sup["supplier_id"]
            for m in msgs:
                h = hashlib.sha1(f"{sid}|{fmt_dt(m['dt'])}|{m['sender']}|{m['text']}".encode()).hexdigest()[:16]
                if h in self.seen:
                    continue
                self.seen.add(h)
                direction = "out" if m["sender"].lower() in self.me else "in"
                lines = self.target_lines(sid, m["text"])
                evs = self.classify(m["text"])
                for line in lines:
                    key = "last_in" if direction == "in" else "last_out"
                    if fmt_dt(m["dt"]) > line[key]:
                        line[key] = fmt_dt(m["dt"])
                    if direction == "out":
                        line["waiting_on"] = "supplier"
                    elif QUESTION_RE.search(m["text"]) or "invoiced" in evs:
                        line["waiting_on"] = "us"
                    else:
                        line["waiting_on"] = "-"
                for ev in evs:
                    targets = lines
                    if ev in PAY_EVENTS and lines:   # оплата относится ко всему заказу
                        oids = {o["order_id"] for o in lines}
                        targets = [o for o in self.open_lines(sid) if o["order_id"] in oids]
                    targets = targets or [{"order_id": "", "pn": ""}]
                    for line in targets:
                        changed = self.apply(line, ev, m, direction) if line.get("supplier_id") else False
                        self.events.append({"ts": fmt_dt(m["dt"]), "supplier_id": sid, "order_id": line["order_id"],
                                            "pn": line["pn"], "event": ev, "direction": direction,
                                            "quote": m["text"][:200].replace("\n", " "), "msg_hash": h})
                        if changed:
                            changes.append((sid, line, ev, m))
                if not evs:
                    self.events.append({"ts": fmt_dt(m["dt"]), "supplier_id": sid,
                                        "order_id": lines[0]["order_id"] if lines else "", "pn": "",
                                        "event": "message", "direction": direction,
                                        "quote": m["text"][:200].replace("\n", " "), "msg_hash": h})
            if not self.dry:
                dst = os.path.join(self.inbox, "processed", f"{self.now:%Y%m%d-%H%M}_{fn}")
                shutil.move(path, dst)
        self.report_changes(changes)
        return changes

    def report_changes(self, changes):
        by_order = {}
        for sid, line, ev, m in changes:
            by_order.setdefault((sid, line["order_id"]), {})[line["pn"]] = line
        for (sid, oid), lines in by_order.items():
            rows = []
            for line in lines.values():
                tr = f", трек {line['tracking']}" if line["tracking"] else ""
                rows.append(f"• {line['pn'] or '(весь заказ)'}: оплата — {PAY_LABEL.get(line['pay_status'], line['pay_status'])}; "
                            f"отгрузка — {SHIP_LABEL.get(line['ship_status'], line['ship_status'])}{tr}")
            all_lines = [o for o in self.orders if o["supplier_id"] == sid and o["order_id"] == oid]
            paid = [o for o in all_lines if o["pay_status"] in ("paid", "confirmed")]
            not_shipped = [o for o in paid if o["ship_status"] not in ("shipped", "delivered")]
            warn = ""
            if paid and not_shipped and len(not_shipped) < len(all_lines) + 1:
                warn = "\n⚠️ Оплачено, но не отгружено: " + ", ".join(o["pn"] or "—" for o in not_shipped)
            self.notes.append(f"🔄 <b>{self.sup_name(sid)}</b>, заказ {oid}\n" + "\n".join(rows) + warn)

    # --- проверка зависаний
    def check(self):
        th = self.cfg["thresholds_days"]
        repeat = self.cfg.get("remind_repeat_days", 2)
        done_order_level = set()
        for o in self.orders:
            if o["ship_status"] == "delivered":
                continue
            last_in, last_out, upd = parse_dt(o["last_in"]), parse_dt(o["last_out"]), parse_dt(o["updated"])
            name = f"<b>{self.sup_name(o['supplier_id'])}</b> / {o['order_id']} / {o['pn'] or '—'}"
            issues = []
            if o["waiting_on"] == "supplier" and last_out and (not last_in or last_in < last_out) \
                    and days_between(last_out, self.now) >= th["supplier_silent"]:
                issues.append(("silent", f"⏰ Нет ответа от поставщика {days_between(last_out, self.now):.0f} дн. "
                                         f"(наше сообщение {o['last_out']}) — {name}"))
            if o["waiting_on"] == "us" and last_in and days_between(last_in, self.now) >= th["we_owe_reply"]:
                issues.append(("we_owe", f"📩 Поставщик ждёт НАШ ответ с {o['last_in']} — {name}"))
            if o["pay_status"] == "invoiced" and upd and days_between(upd, self.now) >= th["invoice_not_paid"]:
                issues.append(("unpaid", f"💳 Счёт получен, но не оплачен уже {days_between(upd, self.now):.0f} дн. — {name}"))
            if o["pay_status"] in ("paid", "confirmed") and o["ship_status"] not in ("shipped", "delivered", "partial") \
                    and upd and days_between(upd, self.now) >= th["paid_not_shipped"]:
                issues.append(("paid_not_shipped", f"🚨 Оплачено, но не отгружено ({SHIP_LABEL.get(o['ship_status'], o['ship_status'])}), "
                                                   f"без движения {days_between(upd, self.now):.0f} дн. — {name}"))
            if o["ship_status"] in ("stock_out", "delayed"):
                issues.append(("problem", f"⚠️ {SHIP_LABEL[o['ship_status']]} — {name}. Нужен срок/замена"))
            if o["ship_status"] == "shipped" and upd and days_between(upd, self.now) >= th["shipped_not_delivered"]:
                issues.append(("transit", f"🚚 В пути {days_between(upd, self.now):.0f} дн., не получено — {name}"
                                          + (f", трек {o['tracking']}" if o["tracking"] else "")))
            last_any = max([d for d in (last_in, last_out, upd) if d], default=None)
            if not issues and last_any and days_between(last_any, self.now) >= th["no_activity"]:
                issues.append(("idle", f"💤 Нет движения {days_between(last_any, self.now):.0f} дн. — {name}"))
            for code, text in issues:
                if code in ORDER_LEVEL:
                    if (o["order_id"], code) in done_order_level:
                        continue
                    done_order_level.add((o["order_id"], code))
                    text = text.replace(f" / {o['pn'] or '—'}</b>", "</b>").replace(f" / {o['pn'] or '—'}", "")
                key = f"{o['order_id']}|{'' if code in ORDER_LEVEL else o['pn']}|{code}"
                prev = parse_dt(self.rstate.get(key, ""))
                if prev and days_between(prev, self.now) < repeat:
                    continue
                self.rstate[key] = fmt_dt(self.now)
                self.notes.append(text)

    # --- STATUS.md
    def write_status(self):
        out = [f"# Статус поставок\n", f"_Обновлено: {fmt_dt(self.now)}. Генерируется `tools/supply_agent.py`._\n"]
        if not self.orders:
            out.append("Заказов пока нет. Добавьте строки в `supply/orders.csv`.\n")
        out.append("| Поставщик | Заказ | P/N | Кол-во | Оплата | Отгрузка | Трек | Ждём | Посл. вход. | Посл. исх. | След. шаг |")
        out.append("|---|---|---|---|---|---|---|---|---|---|---|")
        for o in sorted(self.orders, key=lambda o: (o["ship_status"] == "delivered", o["supplier_id"], o["order_id"])):
            out.append("| " + " | ".join([self.sup_name(o["supplier_id"]), o["order_id"], o["pn"], o["qty"],
                                         PAY_LABEL.get(o["pay_status"], o["pay_status"]),
                                         SHIP_LABEL.get(o["ship_status"], o["ship_status"]), o["tracking"],
                                         WAIT_LABEL.get(o["waiting_on"], o["waiting_on"]), o["last_in"], o["last_out"],
                                         o["next_step"]]) + " |")
        recent = [e for e in self.events if e["event"] != "message"][-20:]
        if recent:
            out.append("\n## Последние изменения\n")
            for e in reversed(recent):
                out.append(f"- {e['ts']} · {self.sup_name(e['supplier_id'])} · {e['order_id']} {e['pn']} · "
                           f"**{e['event']}** ({'от поставщика' if e['direction'] == 'in' else 'от нас'}): «{e['quote']}»")
        with open(os.path.join(self.sd, "STATUS.md"), "w", encoding="utf-8") as f:
            f.write("\n".join(out) + "\n")

    def save(self):
        write_csv(os.path.join(self.sd, "orders.csv"), ORDER_FIELDS, self.orders)
        write_csv(os.path.join(self.sd, "events.csv"), EVENT_FIELDS, self.events)
        if not self.dry:
            with open(self.state_path, "w", encoding="utf-8") as f:
                json.dump(self.rstate, f, ensure_ascii=False, indent=1, sort_keys=True)

    # --- Telegram
    def flush(self):
        if not self.notes:
            print("Изменений и напоминаний нет.")
            return
        text = "📦 <b>Поставки</b>\n\n" + "\n\n".join(self.notes)
        print(re.sub(r"</?b>", "", text))
        if self.dry:
            return
        if not send_telegram(text):
            with open(os.path.join(self.sd, "notifications.md"), "a", encoding="utf-8") as f:
                f.write(f"\n## {fmt_dt(self.now)}\n\n" + re.sub(r"</?b>", "**", text) + "\n")


def send_telegram(text):
    token, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat:
        print("[tg] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID не заданы — пишу в supply/notifications.md", file=sys.stderr)
        return False
    ok = True
    for i in range(0, len(text), 3900):
        data = urllib.parse.urlencode({"chat_id": chat, "text": text[i:i + 3900], "parse_mode": "HTML",
                                       "disable_web_page_preview": "true"}).encode()
        try:
            with urllib.request.urlopen(f"https://api.telegram.org/bot{token}/sendMessage", data, timeout=20) as r:
                ok &= json.load(r).get("ok", False)
        except Exception as e:  # noqa: BLE001
            print(f"[tg] ошибка: {e}", file=sys.stderr)
            ok = False
    return ok


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["ingest", "check", "run", "status", "set", "tg-test"])
    ap.add_argument("args", nargs="*")
    ap.add_argument("--root", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--now")
    a = ap.parse_args()

    if a.cmd == "tg-test":
        sys.exit(0 if send_telegram("✅ Агент поставок Model_Electric подключён.") else 1)

    ag = Agent(a.root, a.dry_run, parse_dt(a.now) if a.now else None)
    if a.cmd == "set":
        if not a.args:
            sys.exit("set ORDER_ID [PN] field=value ...")
        oid, rest = a.args[0], a.args[1:]
        pn = rest.pop(0) if rest and "=" not in rest[0] else None
        kv = dict(x.split("=", 1) for x in rest)
        hit = [o for o in ag.orders if o["order_id"] == oid and (pn is None or o["pn"] == pn)]
        if not hit:
            sys.exit(f"Нет строк заказа {oid} {pn or ''}")
        for o in hit:
            for k, v in kv.items():
                if k not in ORDER_FIELDS:
                    sys.exit(f"Неизвестное поле {k}")
                o[k] = v
            o["updated"] = fmt_dt(ag.now)
            ag.events.append({"ts": fmt_dt(ag.now), "supplier_id": o["supplier_id"], "order_id": oid, "pn": o["pn"],
                              "event": "manual:" + ",".join(f"{k}={v}" for k, v in kv.items()), "direction": "-",
                              "quote": "", "msg_hash": ""})
    if a.cmd in ("ingest", "run"):
        ag.ingest()
    if a.cmd in ("check", "run"):
        ag.check()
    ag.save()
    ag.write_status()
    if a.cmd != "status" and a.cmd != "set":
        ag.flush()


if __name__ == "__main__":
    main()
