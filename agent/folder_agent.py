"""Локальный агент: по команде из дашборда сканирует папку с Excel/CSV
и отдаёт сводку по показаниям в веб-дашборд.

Запуск:
    python agent/folder_agent.py --folder "C:\\Data\\Счётчики"
    python agent/folder_agent.py --config config.json

Дашборд: http://127.0.0.1:8765
"""

import argparse
import csv
import io
import json
import os
import sys
import threading
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

try:
    import openpyxl
except ImportError:  # .xlsx будут пропущены с предупреждением
    openpyxl = None

HERE = Path(__file__).resolve().parent
DASHBOARD = HERE / "dashboard.html"

DEFAULTS = {
    "folder": ".",
    "host": "127.0.0.1",
    "port": 8765,
    "recursive": True,
    "extensions": [".csv", ".txt", ".xlsx", ".xlsm"],
    "max_file_mb": 50,
    "max_points": 500,
    "token": "",
}

DATE_FORMATS = [
    "%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M", "%d.%m.%Y",
    "%d.%m.%y %H:%M", "%d.%m.%y",
    "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d",
    "%d/%m/%Y %H:%M", "%d/%m/%Y",
]

THRESHOLD = 0.8  # доля значений столбца, которые должны распознаться как дата/число


# ---------- распознавание значений ----------

def parse_number(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str):
        return None
    s = value.strip().replace("\u00a0", "").replace(" ", "")
    if not s:
        return None
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".") if s.rfind(",") > s.rfind(".") else s.replace(",", "")
    else:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def parse_date(value):
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str):
        return None
    s = value.strip()
    if not s or len(s) < 6:
        return None
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            pass
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


def is_empty(value):
    return value is None or (isinstance(value, str) and not value.strip())


# ---------- чтение файлов ----------

def read_csv(path):
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "cp1251"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = raw.decode("latin-1")
    rows = [r for r in csv.reader(io.StringIO(text), delimiter=detect_delimiter(text)) if any(c.strip() for c in r)]
    return [("", rows)]


def detect_delimiter(text):
    """Разделитель, который даёт одинаковое число столбцов в первых строках.
    ';' проверяется раньше ',', т.к. в русских выгрузках запятая — десятичный знак."""
    lines = [ln for ln in text.splitlines()[:30] if ln.strip()]
    for d in (";", "\t", "|", ","):
        counts = {ln.count(d) for ln in lines}
        if len(counts) == 1 and counts.pop() > 0:
            return d
    return max((";", "\t", "|", ","), key=lambda d: sum(ln.count(d) for ln in lines))


def read_xlsx(path):
    if openpyxl is None:
        raise RuntimeError("для .xlsx установите openpyxl: pip install openpyxl")
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        sheets = []
        for ws in wb.worksheets:
            rows = [list(r) for r in ws.iter_rows(values_only=True) if any(not is_empty(c) for c in r)]
            if rows:
                sheets.append((ws.title, rows))
        return sheets
    finally:
        wb.close()


# ---------- анализ таблицы ----------

def find_header(rows):
    """Первая строка, где большинство ячеек — непустой текст, не число и не дата."""
    for i, row in enumerate(rows[:20]):
        cells = [c for c in row if not is_empty(c)]
        if len(cells) >= 2 and all(
            isinstance(c, str) and parse_number(c) is None and parse_date(c) is None for c in cells
        ):
            return i
    return None


def downsample(points, limit):
    if len(points) <= limit:
        return points
    step = len(points) / limit
    picked = [points[int(i * step)] for i in range(limit)]
    picked[-1] = points[-1]
    return picked


def analyze_table(rows, max_points):
    h = find_header(rows)
    if h is None:
        width = max(len(r) for r in rows)
        header = [f"Столбец {i + 1}" for i in range(width)]
        data = rows
    else:
        header = [str(c).strip() if not is_empty(c) else f"Столбец {i + 1}" for i, c in enumerate(rows[h])]
        data = rows[h + 1:]
        width = max([len(header)] + [len(r) for r in data])
        header += [f"Столбец {i + 1}" for i in range(len(header), width)]

    def column(i):
        return [r[i] if i < len(r) else None for r in data]

    date_col, numeric_cols = None, []
    for i in range(width):
        values = [v for v in column(i) if not is_empty(v)]
        if not values:
            continue
        if date_col is None and sum(parse_date(v) is not None for v in values) >= THRESHOLD * len(values):
            date_col = i
            continue
        if sum(parse_number(v) is not None for v in values) >= THRESHOLD * len(values):
            numeric_cols.append(i)

    dates = [parse_date(v) for v in column(date_col)] if date_col is not None else None
    columns = []
    for i in numeric_cols:
        points = []
        for row_no, raw in enumerate(column(i)):
            v = parse_number(raw)
            if v is None:
                continue
            if dates is not None:
                if dates[row_no] is None:
                    continue
                points.append((dates[row_no].isoformat(timespec="minutes"), v))
            else:
                points.append((row_no + 1, v))
        if not points:
            continue
        if dates is not None:
            points.sort(key=lambda p: p[0])
        values = [p[1] for p in points]
        columns.append({
            "name": header[i],
            "count": len(values),
            "sum": sum(values),
            "min": min(values),
            "max": max(values),
            "avg": sum(values) / len(values),
            "first": values[0],
            "last": values[-1],
            "delta": values[-1] - values[0],
            "series": downsample(points, max_points),
        })

    period = None
    if dates is not None:
        valid = sorted(d for d in dates if d is not None)
        if valid:
            period = [valid[0].isoformat(timespec="minutes"), valid[-1].isoformat(timespec="minutes")]

    return {
        "rows": len(data),
        "header": header,
        "date_column": header[date_col] if date_col is not None else None,
        "period": period,
        "columns": columns,
    }


# ---------- сканирование папки ----------

class Scanner:
    def __init__(self, cfg):
        self.cfg = cfg
        self.lock = threading.Lock()
        self.last = None
        self.prev_mtimes = {}

    def list_files(self):
        root = Path(self.cfg["folder"]).expanduser()
        exts = {e.lower() for e in self.cfg["extensions"]}
        pattern = root.rglob("*") if self.cfg["recursive"] else root.glob("*")
        return root, sorted(p for p in pattern if p.is_file() and p.suffix.lower() in exts
                            and not p.name.startswith("~$"))

    def scan(self):
        with self.lock:
            root, paths = self.list_files()
            if not root.is_dir():
                raise FileNotFoundError(f"папка не найдена: {root}")
            files, mtimes = [], {}
            for p in paths:
                rel = str(p.relative_to(root))
                st = p.stat()
                mtimes[rel] = st.st_mtime
                entry = {
                    "path": rel,
                    "size": st.st_size,
                    "modified": datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds"),
                    "change": ("new" if rel not in self.prev_mtimes
                               else "changed" if self.prev_mtimes[rel] != st.st_mtime else "same")
                               if self.prev_mtimes else "same",
                    "tables": [],
                    "error": None,
                }
                try:
                    if st.st_size > self.cfg["max_file_mb"] * 1024 * 1024:
                        raise RuntimeError(f"файл больше {self.cfg['max_file_mb']} МБ")
                    sheets = read_xlsx(p) if p.suffix.lower() in (".xlsx", ".xlsm") else read_csv(p)
                    for sheet, rows in sheets:
                        table = analyze_table(rows, self.cfg["max_points"])
                        table["sheet"] = sheet
                        entry["tables"].append(table)
                except Exception as exc:  # noqa: BLE001 — ошибка одного файла не должна ронять скан
                    entry["error"] = str(exc)
                files.append(entry)

            removed = sorted(set(self.prev_mtimes) - set(mtimes)) if self.prev_mtimes else []
            self.prev_mtimes = mtimes
            self.last = {
                "folder": str(root.resolve()),
                "scanned_at": datetime.now().isoformat(timespec="seconds"),
                "files": files,
                "removed": removed,
            }
            return self.last


# ---------- HTTP ----------

def make_handler(scanner):
    cfg = scanner.cfg

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            sys.stderr.write("[%s] %s\n" % (datetime.now().strftime("%H:%M:%S"), fmt % args))

        def send_json(self, code, payload):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def authorized(self):
            if cfg["token"] and self.headers.get("X-Token") != cfg["token"]:
                self.send_json(401, {"error": "неверный токен"})
                return False
            return True

        def do_GET(self):
            if self.path in ("/", "/index.html"):
                body = DASHBOARD.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            elif self.path == "/api/info":
                if self.authorized():
                    self.send_json(200, {
                        "folder": str(Path(cfg["folder"]).expanduser().resolve()),
                        "token_required": bool(cfg["token"]),
                        "scanned_at": scanner.last and scanner.last["scanned_at"],
                        "xlsx_supported": openpyxl is not None,
                    })
            elif self.path == "/api/result":
                if self.authorized():
                    self.send_json(200, scanner.last or {"files": [], "scanned_at": None})
            else:
                self.send_json(404, {"error": "не найдено"})

        def do_POST(self):
            if self.path != "/api/scan":
                self.send_json(404, {"error": "не найдено"})
                return
            if not self.authorized():
                return
            try:
                self.send_json(200, scanner.scan())
            except Exception as exc:  # noqa: BLE001
                self.send_json(500, {"error": str(exc)})

    return Handler


def load_config(argv=None):
    ap = argparse.ArgumentParser(description="Агент папки для дашборда показаний")
    ap.add_argument("--config", help="путь к config.json")
    ap.add_argument("--folder", help="папка с файлами показаний")
    ap.add_argument("--host")
    ap.add_argument("--port", type=int)
    ap.add_argument("--token", help="если задан, дашборд должен передавать его")
    ap.add_argument("--no-recursive", action="store_true", help="не заходить в подпапки")
    args = ap.parse_args(argv)

    cfg = dict(DEFAULTS)
    if args.config:
        with open(args.config, encoding="utf-8") as f:
            cfg.update(json.load(f))
    for key in ("folder", "host", "port", "token"):
        if getattr(args, key) is not None:
            cfg[key] = getattr(args, key)
    if args.no_recursive:
        cfg["recursive"] = False
    return cfg


def main():
    cfg = load_config()
    scanner = Scanner(cfg)
    server = ThreadingHTTPServer((cfg["host"], cfg["port"]), make_handler(scanner))
    print(f"Папка:   {Path(cfg['folder']).expanduser().resolve()}")
    print(f"Дашборд: http://{cfg['host']}:{cfg['port']}")
    if openpyxl is None:
        print("Внимание: openpyxl не установлен, .xlsx будут пропущены (pip install openpyxl)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
