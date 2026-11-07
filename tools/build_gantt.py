"""Строит диаграмму Ганта и сводку статусов из project/plan.yaml.

Запуск из корня репозитория:  python3 tools/build_gantt.py [--today ГГГГ-ММ-ДД]
Результат: project/GANTT.md (Mermaid, отображается на GitHub) и project/Gantt.xlsx (недельная сетка).
"""
import argparse
import datetime as dt
import os

import yaml
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAN = os.path.join(ROOT, "project", "plan.yaml")
OUT_MD = os.path.join(ROOT, "project", "GANTT.md")
OUT_XLSX = os.path.join(ROOT, "project", "Gantt.xlsx")

STATUS_RU = {"done": "✅ выполнено", "active": "🔄 в работе", "planned": "⏳ запланировано",
             "blocked": "⛔ заблокировано", "overdue": "⚠️ срок прошёл — подтвердить"}
COLOR = {"done": "70AD47", "active": "4472C4", "planned": "BDD7EE", "blocked": "C00000", "overdue": "ED7D31"}
MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]


def d(v):
    return v if isinstance(v, dt.date) else dt.date.fromisoformat(str(v))


def load():
    with open(PLAN, encoding="utf-8") as f:
        plan = yaml.safe_load(f)
    items = []  # плоский список: (phase, item, level)
    for ph in plan["phases"]:
        for t in ph["tasks"]:
            items.append((ph, t, 0))
            for s in t.get("subtasks", []):
                items.append((ph, s, 1))
    for _, t, _ in items:
        t["id"] = str(t["id"])
        if t.get("milestone"):
            t["start"] = t["end"] = d(t["date"])
        else:
            t["start"], t["end"] = d(t["start"]), d(t["end"])
            if t["end"] < t["start"]:
                raise SystemExit(f"Задача {t['id']}: end раньше start")
        if t["status"] not in ("done", "active", "planned", "blocked"):
            raise SystemExit(f"Задача {t['id']}: неизвестный статус {t['status']!r}")
    return plan, items


def effective(t, today):
    return "overdue" if t["status"] != "done" and t["end"] < today else t["status"]


def progress(t, today):
    if t["status"] == "done":
        return 100
    if "progress" in t:
        return int(t["progress"])
    subs = t.get("subtasks")
    if subs:
        return round(sum(progress(s, today) for s in subs) / len(subs))
    return 0


def check_deps(items):
    by_id = {t["id"]: t for _, t, _ in items}
    warn = []
    for _, t, _ in items:
        for p in t.get("after", []):
            p = str(p)
            if p not in by_id:
                warn.append(f"Задача {t['id']}: предшественник {p} не найден")
            elif by_id[p]["end"] > t["end"]:
                warn.append(f"Задача {t['id']} заканчивается раньше предшественника {p}")
    return warn


def fmt(day):
    return f"{day.day:02d}.{day.month:02d}.{day.year % 100:02d}"


def md_escape(s):
    return str(s).replace("|", "\\|")


def mermaid_text(s):
    return str(s).replace(":", " ").replace(";", ",").replace("#", "№")


def build_md(plan, items, today, warns):
    lines = [f"# {plan['project']}: диаграмма Ганта", "",
             f"Обновлено: {fmt(today)}. Источник: [`plan.yaml`](plan.yaml), "
             f"генератор: `python3 tools/build_gantt.py`. Excel-версия: [`Gantt.xlsx`](Gantt.xlsx).", ""]

    tops = [t for _, t, lvl in items if lvl == 0]
    cnt = {k: sum(1 for t in tops if effective(t, today) == k) for k in STATUS_RU}
    total = len(tops)
    done_pct = round(sum(progress(t, today) for t in tops) / total) if total else 0
    lines += ["## Сводка", "",
              f"Задач и вех: **{total}**, общий прогресс **{done_pct}%**.", ""]
    lines += [f"- {STATUS_RU[k]}: {v}" for k, v in cnt.items() if v]
    lines.append("")
    if warns:
        lines += ["**Предупреждения по зависимостям:**", ""] + [f"- {w}" for w in warns] + [""]

    lines += ["## Диаграмма", "", "```mermaid", "gantt",
              f"    title {mermaid_text(plan['project'])}", "    dateFormat YYYY-MM-DD",
              "    axisFormat %d.%m", "    todayMarker stroke-width:3px,stroke:#d00"]
    tag = {"done": "done", "active": "active", "planned": "", "blocked": "crit", "overdue": "crit"}
    cur = None
    for ph, t, lvl in items:
        if ph is not cur:
            cur = ph
            lines.append(f"    section {mermaid_text(ph['name'])}")
        flags = [x for x in (tag[effective(t, today)], "milestone" if t.get("milestone") else "") if x]
        name = mermaid_text(f"{'  ↳ ' if lvl else ''}{t['id']}. {t['name']}")
        tid = "t" + t["id"].replace(".", "_")
        if t.get("milestone"):
            span = f"{t['start'].isoformat()}, 0d"
        else:
            span = f"{t['start'].isoformat()}, {(t['end'] + dt.timedelta(days=1)).isoformat()}"
        lines.append(f"    {name} :{', '.join(flags + [tid, span])}")
    lines += ["```", ""]

    lines += ["## Задачи по направлениям", ""]
    for ph in plan["phases"]:
        lines += [f"### {ph['name']}", "",
                  "| № | Задача | Срок | Даты | Статус | % | Отв. | Примечание |",
                  "|---|---|---|---|---|---|---|---|"]
        for p2, t, lvl in items:
            if p2 is not ph:
                continue
            dates = fmt(t["start"]) if t.get("milestone") else f"{fmt(t['start'])} – {fmt(t['end'])}"
            name = ("↳ " if lvl else "") + ("◆ " if t.get("milestone") else "") + t["name"]
            note = t.get("note", "")
            if t.get("after"):
                note = (note + "; " if note else "") + "после: " + ", ".join(map(str, t["after"]))
            lines.append(f"| {t['id']} | {md_escape(name)} | {md_escape(t.get('period', ''))} | {dates} | "
                         f"{STATUS_RU[effective(t, today)]} | {progress(t, today)} | {md_escape(t.get('owner', ''))} | "
                         f"{md_escape(note)} |")
        lines.append("")

    lines += ["## Как обновлять", "",
              "1. Поменять `status` / `progress` / даты в [`plan.yaml`](plan.yaml).",
              "2. `python3 tools/build_gantt.py`",
              "3. Закоммитить `project/`.", "",
              "Задача, у которой срок прошёл, а статус не `done`, отображается как «⚠️ срок прошёл — подтвердить».", ""]
    with open(OUT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def build_xlsx(plan, items, today):
    start = min(t["start"] for _, t, _ in items)
    end = max(t["end"] for _, t, _ in items)
    w0 = start - dt.timedelta(days=start.weekday())  # понедельник
    weeks = []
    while w0 <= end:
        weeks.append(w0)
        w0 += dt.timedelta(days=7)

    wb = Workbook()
    ws = wb.active
    ws.title = "Гант"
    thin = Side(style="thin", color="BFBFBF")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    hdr_fill = PatternFill("solid", fgColor="1F4E78")
    hdr_font = Font(bold=True, color="FFFFFF")
    head = ["№", "Задача", "Срок", "Начало", "Окончание", "Статус", "%", "Отв."]
    nf = len(head)
    ws.cell(1, 1, f"{plan['project']} — обновлено {fmt(today)}").font = Font(bold=True, size=13)
    for i, h in enumerate(head, 1):
        c = ws.cell(3, i, h)
        c.fill, c.font, c.border = hdr_fill, hdr_font, border
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    for j, wk in enumerate(weeks):
        col = nf + 1 + j
        ws.cell(2, col, f"{MONTHS[(wk + dt.timedelta(days=3)).month - 1]}").alignment = Alignment(horizontal="center")
        c = ws.cell(3, col, f"W{wk.isocalendar()[1]}\n{wk.day:02d}.{wk.month:02d}")
        c.fill, c.font, c.border = hdr_fill, hdr_font, border
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(col)].width = 6.5
    for col, wdt in zip("ABCDEFGH", (6, 58, 18, 10, 10, 26, 5, 12)):
        ws.column_dimensions[col].width = wdt
    ws.row_dimensions[3].height = 30

    row = 4
    cur = None
    for ph, t, lvl in items:
        if ph is not cur:
            cur = ph
            c = ws.cell(row, 1, ph["name"])
            c.font = Font(bold=True)
            for col in range(1, nf + len(weeks) + 1):
                ws.cell(row, col).fill = PatternFill("solid", fgColor="D9E1F2")
            row += 1
        st = effective(t, today)
        vals = [t["id"], ("    ↳ " if lvl else "") + ("◆ " if t.get("milestone") else "") + t["name"],
                t.get("period", ""), t["start"], t["end"], STATUS_RU[st], progress(t, today), t.get("owner", "")]
        for i, v in enumerate(vals, 1):
            c = ws.cell(row, i, v)
            c.border = border
            c.alignment = Alignment(vertical="center", wrap_text=(i == 2))
            if i in (4, 5):
                c.number_format = "DD.MM.YY"
        if lvl:
            ws.cell(row, 2).font = Font(italic=True, color="595959")
        for j, wk in enumerate(weeks):
            c = ws.cell(row, nf + 1 + j)
            c.border = border
            if t["start"] <= wk + dt.timedelta(days=6) and t["end"] >= wk:
                c.fill = PatternFill("solid", fgColor=COLOR[st])
                if t.get("milestone"):
                    c.value = "◆"
                    c.font = Font(bold=True, color="FFFFFF")
                    c.alignment = Alignment(horizontal="center")
            if wk <= today <= wk + dt.timedelta(days=6):
                c.border = Border(left=Side(style="medium", color="FF0000"), right=Side(style="medium", color="FF0000"),
                                  top=thin, bottom=thin)
        row += 1

    row += 1
    ws.cell(row, 2, "Легенда:").font = Font(bold=True)
    for k, label in STATUS_RU.items():
        row += 1
        ws.cell(row, 1).fill = PatternFill("solid", fgColor=COLOR[k])
        ws.cell(row, 2, label)
    ws.cell(row + 1, 2, "Красная рамка — текущая неделя; ◆ — веха.")
    ws.freeze_panes = ws.cell(4, nf + 1)
    wb.save(OUT_XLSX)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--today", help="дата отчёта ГГГГ-ММ-ДД (по умолчанию — сегодня)")
    args = ap.parse_args()
    today = d(args.today) if args.today else dt.date.today()
    plan, items = load()
    warns = check_deps(items)
    build_md(plan, items, today, warns)
    build_xlsx(plan, items, today)
    for w in warns:
        print("ВНИМАНИЕ:", w)
    tops = [t for _, t, lvl in items if lvl == 0]
    for k in STATUS_RU:
        n = sum(1 for t in tops if effective(t, today) == k)
        if n:
            print(f"{STATUS_RU[k]}: {n}")
    print(f"Готово: {os.path.relpath(OUT_MD, ROOT)}, {os.path.relpath(OUT_XLSX, ROOT)}")


if __name__ == "__main__":
    main()
