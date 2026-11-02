"""Собирает итоговый файл загрузки в проект модельной электрики.

Источники (sources/):
  Plan_razrabotok_Ozon.xlsx    — «План разработок» (зелёная заливка модели = согласовано в работу), продажи Ozon;
  Svod_cen_postavshikov.xlsx   — свод цен поставщиков разъёмов, лист «Лист1 (2)» (8 поставщиков).
Сверка артикулов — с specs/Summary_all_drawings.xlsx (лист «Все разъёмы»).

Запуск из корня репозитория:  python3 tools/build_upload.py
Результат: export/Model_Electric_upload.xlsx
"""
import os
import re
from collections import defaultdict
from datetime import date

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import column_index_from_string as ci
from openpyxl.utils import get_column_letter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAN = os.path.join(ROOT, "sources", "Plan_razrabotok_Ozon.xlsx")
PRICES = os.path.join(ROOT, "sources", "Svod_cen_postavshikov.xlsx")
SUMMARY = os.path.join(ROOT, "specs", "Summary_all_drawings.xlsx")
OUT = os.path.join(ROOT, "export", "Model_Electric_upload.xlsx")

PRICE_SHEET = "Лист1 (2)"
SUPPLIERS = ["Ylcn", "HD Connector", "JINGMING", "Star technology", "Jiangsu Xing Yao Electric",
             "YBConnector", "QCLNC", "OLT"]
MALE_OEM, FEMALE_OEM = "C", "AK"
MALE_START, FEMALE_START = ci("E"), ci("AM")  # по 4 колонки на поставщика: артикул, MOQ, цена, итого
GREEN = "FF92D050"
# Проекты, где в своде цен есть не все разъёмы чертежа
PARTIAL = {22: "в своде нет 2-поз. Yazaki 7282/7283-8851-30", 17: "AMP 1-929592-1 без ответной части и цены"}
ALT_LABEL = {17: "доп. разъём (уточнить)", 37: "альтернатива"}

# Блоки свода цен: основная строка -> доп. строка (второй разъём комплекта), имя блока
PRICE_BLOCKS = {4: 5, 6: 7, 8: 9}

# Строки «Плана разработок» -> (№ чертежей, строки свода цен для себестоимости, альтернативные строки, замечание)
PLAN_MAP = {
    5: ([4], [16], [], "Не согласовано; разъёмы как у Granta"),
    7: ([5], [14], [], "Не согласовано; уточнить исполнение Niva Travel"),
    9: ([2], [8], [], "Не согласовано; разъёмы как у Vesta NG"),
    12: ([5], [14], [], "Чертёж №5: 191972716 / 1J0972706"),
    13: ([12], [21], [], "Чертёж №12 на TE 1-929627-1 = 19296271 (строка свода Chevrolet Niva), а не 191972716"),
    14: ([11], [18], [], "Чертёж №11: колодки 2105-3724341"),
    15: ([1], [17], [], "Чертёж №1: 928522-1"),
    16: ([9], [19], [], ""),
    17: ([10], [19], [12], "Доп. разъём AMP 1-929592-1: ответная часть не найдена, цен нет"),
    18: ([4], [16], [], "Артикулы свода (3C0 972 733 / 1J0 972 926) не совпадают с чертежом (TE 1-929621-1 / 1-929627-1)"),
    19: ([8], [16], [], "Артикулы свода (3C0 972 733 / 1J0 972 926) не совпадают с чертежом №8 (TE 1-929627-1 / 1-929621-1)"),
    20: ([4], [16], [], "Артикулы свода (3C0 972 733 / 1J0 972 926) не совпадают с чертежом (TE 1-929621-1 / 1-929627-1)"),
    21: ([2], [8], [], "Свод: 174922-1 / 174929-1, чертёж: 174922-2 / 174929-2 (другой ключ корпуса)"),
    22: ([3], [20], [], "2-поз. Yazaki 7282/7283-8851-30 из чертежа в своде цен отсутствует"),
    23: ([7], [21], [], "19296271 / 19296211 = TE 1-929627-1 / 1-929621-1"),
    29: ([], [4], [], ""),
    30: ([], [6], [], ""),
    31: ([], [22], [], ""),
    33: ([], [10], [], "Female в своде цен не указан"),
    34: ([], [11], [], ""),
    37: ([], [15], [19], "Альтернатива: Molex 98821/98825-1061 (строка Largus/Logan 2)"),
    39: ([6], [13], [], "Свод: male 5G0972715, чертёж №6: 5K0972715"),
}

HDR = PatternFill("solid", fgColor="1F4E78")
OKF = PatternFill("solid", fgColor="E2EFDA")
WARN = PatternFill("solid", fgColor="FFF2CC")
BAD = PatternFill("solid", fgColor="F8CBAD")
thin = Side(style="thin", color="999999")
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)


def norm(pn):
    s = re.sub(r"\(.*?\)", "", str(pn)).upper().replace("AMP", "")
    return re.sub(r"[^0-9A-Z]", "", s)


def clean(v):
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    s = re.sub(r"\s+", " ", str(v)).strip()
    return s or None


def num(v):
    return round(float(v), 4) if isinstance(v, (int, float)) else None


def drawing_pns():
    ws = load_workbook(SUMMARY, read_only=True)["Все разъёмы"]
    res = defaultdict(set)
    for r in ws.iter_rows(min_row=2, values_only=True):
        if r[0] and r[6] not in (None, "—"):
            res[r[0]].add(norm(r[6]))
    return res


def read_prices():
    wb = load_workbook(PRICES, data_only=True)
    ws = wb[PRICE_SHEET]
    rate, coef = ws["BS1"].value, ws["BT1"].value
    blocks = {}
    for r in range(4, ws.max_row + 1):
        name = clean(ws[f"B{r}"].value)
        if not name:
            continue
        rows = [r] + ([PRICE_BLOCKS[r]] if r in PRICE_BLOCKS else [])
        qty_main = ws[f"A{r}"].value or 1
        lines = []
        for i, rr in enumerate(rows):
            qty = qty_main if i == 0 else (ws[f"A{rr}"].value or 1)
            role = "основной" if i == 0 else "доп."
            for side, oem_col, start in (("Male", MALE_OEM, MALE_START), ("Female", FEMALE_OEM, FEMALE_START)):
                oem = clean(ws[f"{oem_col}{rr}"].value)
                offers = []
                for k, sup in enumerate(SUPPLIERS):
                    c = start + 4 * k
                    art = clean(ws.cell(rr, c).value)
                    moq = num(ws.cell(rr, c + 1).value)
                    price = num(ws.cell(rr, c + 2).value)
                    if price is None and art is None:
                        continue
                    note = []
                    if art is None:
                        note.append("нет артикула поставщика")
                    if price is None:
                        note.append("нет цены")
                    if moq is None and price is not None:
                        note.append("нет MOQ")
                    offers.append(dict(sup=sup, art=art, moq=moq, price=price, note="; ".join(note)))
                if oem is None and not offers:
                    continue
                if oem and oem.lower().startswith("i need"):
                    oem = None
                lines.append(dict(row=rr, side=side, role=role, oem=oem, qty=qty, offers=offers))
        blocks[r] = dict(name=name, lines=lines, bt=num(ws[f"BT{r}"].value), file_total=num(ws[f"BS{r}"].value))
    return blocks, rate, coef


def best_offer(offers):
    priced = [o for o in offers if o["price"] is not None]
    good = [o for o in priced if o["art"]]
    pool = good or priced
    return min(pool, key=lambda o: o["price"]) if pool else None


def read_plan():
    ws = load_workbook(PLAN, data_only=True)["План разработок"]
    group, res = None, []
    for r in range(1, ws.max_row + 1):
        b = clean(ws[f"B{r}"].value)
        c = clean(ws[f"C{r}"].value)
        if b and not c:
            group = b
            continue
        if not b or b == "Марка":
            continue
        fill = ws[f"C{r}"].fill
        approved = bool(fill and fill.fill_type and fill.fgColor.rgb == GREEN)
        res.append(dict(row=r, group=group, brand=b, model=c, gen=clean(ws[f"D{r}"].value),
                        qty=ws[f"E{r}"].value, sum=ws[f"F{r}"].value, avg=num(ws[f"G{r}"].value),
                        kind=clean(ws[f"H{r}"].value), note=clean(ws[f"I{r}"].value), approved=approved))
    return res


def write_sheet(wb, title, header, rows, widths, fills=None, first=False):
    ws = wb.active if first else wb.create_sheet(title)
    ws.title = title
    ws.append(header)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = HDR
        c.alignment = Alignment(wrap_text=True, vertical="center")
        c.border = BORDER
    for i, r in enumerate(rows):
        ws.append(r)
        f = fills[i] if fills else None
        for c in ws[ws.max_row]:
            c.border = BORDER
            c.alignment = Alignment(wrap_text=True, vertical="top")
            if f:
                c.fill = f
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    return ws


def main():
    blocks, rate, coef = read_prices()
    k = rate * coef
    dpn = drawing_pns()
    plan = read_plan()

    up_rows, up_fill, proj_rows, proj_fill, remarks = [], [], [], [], []
    uid = 0
    for p in plan:
        drawings, kit_rows, alt_rows, note = PLAN_MAP.get(p["row"], ([], [], [], ""))
        car = f"{p['brand']} {p['model']} {p['gen'] or ''}".strip()
        kit_cny, n_lines, n_noprice, n_mismatch = 0.0, 0, 0, 0
        for variant, rows_ in (("комплект", kit_rows), (ALT_LABEL.get(p["row"], "альтернатива"), alt_rows)):
            for br in rows_:
                blk = blocks[br]
                for ln in blk["lines"]:
                    uid += 1
                    best = best_offer(ln["offers"])
                    if drawings and ln["oem"]:
                        hit = [d for d in drawings if norm(ln["oem"]) in dpn.get(d, set())]
                        check = f"есть в чертеже №{hit[0]}" if hit else "нет в чертеже"
                    elif drawings:
                        check = "OEM не указан"
                    else:
                        check = "чертежа нет"
                    line_cny = round(best["price"] * ln["qty"], 4) if best else None
                    alts = "; ".join(f"{o['sup']}: {o['art'] or '—'} — {o['price'] if o['price'] is not None else '—'}"
                                     for o in sorted(ln["offers"], key=lambda o: (o["price"] is None, o["price"] or 0))
                                     if o is not best)
                    issues = []
                    if not ln["oem"]:
                        issues.append("не найден OEM-артикул ответной части")
                    if not best:
                        issues.append("нет цены")
                    elif best["note"]:
                        issues.append(f"лучшая цена: {best['note']}")
                    if check == "нет в чертеже":
                        issues.append("артикул не совпадает с чертежом")
                    if not best:
                        status = "Нет цены"
                    elif issues:
                        status = "Проверить"
                    else:
                        status = "OK" if check.startswith("есть") else "Нет чертежа"
                    if variant == "комплект":
                        n_lines += 1
                        if best:
                            kit_cny += line_cny
                        else:
                            n_noprice += 1
                        if check == "нет в чертеже":
                            n_mismatch += 1
                    up_rows.append([
                        uid, p["group"], p["brand"], p["model"], p["gen"], "Да" if p["approved"] else "Нет",
                        ", ".join(map(str, drawings)) or None, variant, f"{blk['name']} (стр. {ln['row']})",
                        ln["side"], ln["role"], ln["oem"], ln["qty"], check,
                        best["sup"] if best else None, best["art"] if best else None, best["moq"] if best else None,
                        best["price"] if best else None, line_cny, round(line_cny * k, 2) if best else None,
                        len([o for o in ln["offers"] if o["price"] is not None]), alts or None, status,
                        "; ".join(issues) or None])
                    up_fill.append({"OK": OKF, "Нет цены": BAD}.get(status, WARN))
        bt = blocks[kit_rows[0]]["bt"] if kit_rows else None
        kit_rub = round(kit_cny * k, 2) if n_lines and n_noprice < n_lines else None
        missing = []
        if not p["approved"]:
            missing.append("не согласовано в работу")
        if not drawings:
            missing.append("нет чертежа")
        if not kit_rows:
            missing.append("нет цен разъёмов")
        elif n_noprice:
            missing.append(f"без цены: {n_noprice} поз.")
        if p["row"] in PARTIAL:
            missing.append(PARTIAL[p["row"]])
        if n_mismatch:
            missing.append(f"артикулы не совпадают с чертежом: {n_mismatch} поз.")
        if not p["approved"]:
            ready = "Не в работе"
        elif drawings and kit_rows and not n_noprice and not n_mismatch and p["row"] not in PARTIAL:
            ready = "Готов к загрузке"
        elif kit_rows or drawings:
            ready = "Частично"
        else:
            ready = "Нет данных"
        share = round(kit_rub / p["avg"] * 100, 2) if kit_rub and p["avg"] else None
        proj_rows.append([p["group"], p["brand"], p["model"], p["gen"], "Да" if p["approved"] else "Нет",
                          p["qty"], p["sum"], p["avg"], p["kind"], ", ".join(map(str, drawings)) or None,
                          ", ".join(blocks[r]["name"] for r in kit_rows) or None, n_lines or None,
                          round(kit_cny, 3) if kit_rub else None, kit_rub, bt, share, ready,
                          "; ".join(missing) or None, "; ".join(x for x in (note, p["note"]) if x) or None])
        proj_fill.append({"Готов к загрузке": OKF, "Частично": WARN, "Нет данных": BAD}.get(ready))
        if note:
            remarks.append(["Проект", car, note])

    # Все предложения поставщиков
    offer_rows = []
    for br, blk in blocks.items():
        for ln in blk["lines"]:
            best = best_offer(ln["offers"])
            for o in ln["offers"]:
                offer_rows.append([blk["name"], ln["row"], ln["side"], ln["role"], ln["oem"], ln["qty"], o["sup"],
                                   o["art"], o["moq"], o["price"],
                                   round(o["price"] * ln["qty"], 4) if o["price"] is not None else None,
                                   "Да" if o is best else None, o["note"] or None])

    # Замечания по своду цен
    for br, blk in blocks.items():
        kit = 0.0
        ok = True
        if not any(best_offer(ln["offers"]) for ln in blk["lines"]):
            remarks.append(["Свод цен", blk["name"], "Цен нет: ответный разъём не подобран"])
            continue
        for ln in blk["lines"]:
            b = best_offer(ln["offers"])
            if b:
                kit += b["price"] * ln["qty"]
            else:
                ok = False
        calc = round(kit * k, 2)
        if blk["file_total"] is None:
            remarks.append(["Свод цен", blk["name"], f"Итог на комплект в своде не посчитан; по минимальной цене каждого разъёма: {calc} ₽"
                            + ("" if ok else " (есть позиции без цены)")])
        elif abs(blk["file_total"] - calc) > 0.5:
            remarks.append(["Свод цен", blk["name"],
                            f"Итог в своде {round(blk['file_total'], 2)} ₽ ; при выборе минимальной цены по каждому разъёму: {calc} ₽"])
        for ln in blk["lines"]:
            if not ln["oem"]:
                remarks.append(["Свод цен", blk["name"], f"{ln['side']}, стр. {ln['row']}: не указан OEM-артикул"])
            for o in ln["offers"]:
                if o["note"]:
                    remarks.append(["Свод цен", blk["name"], f"{ln['side']}, стр. {ln['row']}, {o['sup']}: {o['note']}"])
    remarks.append(["Свод цен", "Все", "Колонка pic: картинки не выгружаются (#VALUE!)"])
    remarks.append(["Свод цен", "Granta / Haval M6", "Артикул Xing Yao XY-49 указан у двух разных разъёмов — проверить"])

    wb = Workbook()
    write_sheet(wb, "Загрузка",
                ["ID", "Группа", "Марка", "Модель", "Поколение", "Согласовано", "№ чертежа", "Вариант",
                 "Блок свода цен", "Сторона", "Роль", "OEM артикул", "Кол-во на комплект", "Сверка с чертежом",
                 "Поставщик (лучшая цена)", "Артикул поставщика", "MOQ", "Цена, CNY", "Сумма на комплект, CNY",
                 "Сумма на комплект, ₽", "Предложений", "Альтернативы (поставщик: артикул — цена CNY)",
                 "Статус", "Замечание"],
                up_rows, [5, 10, 11, 22, 11, 11, 9, 12, 26, 8, 9, 18, 9, 18, 22, 22, 7, 9, 11, 11, 9, 60, 10, 45],
                up_fill, first=True)
    write_sheet(wb, "Проекты",
                ["Группа", "Марка", "Модель", "Поколение", "Согласовано", "Заказано, шт", "Заказано, ₽",
                 "Ср. цена продажи, ₽", "Тип проводки", "№ чертежа", "Блок свода цен", "Позиций разъёмов",
                 "Разъёмы на комплект, CNY", "Разъёмы на комплект, ₽", "Цена первичный анализ, ₽",
                 "Доля разъёмов в цене продажи, %", "Готовность", "Чего не хватает", "Комментарий"],
                proj_rows, [10, 11, 28, 13, 11, 10, 12, 11, 30, 9, 26, 9, 11, 11, 11, 11, 15, 40, 50], proj_fill)
    write_sheet(wb, "Цены поставщиков",
                ["Блок свода цен", "Строка", "Сторона", "Роль", "OEM артикул", "Кол-во на комплект", "Поставщик",
                 "Артикул поставщика", "MOQ", "Цена, CNY", "Сумма на комплект, CNY", "Лучшая", "Замечание"],
                offer_rows, [26, 7, 8, 9, 18, 9, 24, 24, 7, 9, 11, 8, 35])
    write_sheet(wb, "Замечания", ["Раздел", "Объект", "Замечание"], remarks, [12, 30, 100])
    write_sheet(wb, "Параметры", ["Параметр", "Значение"], [
        ["Дата выгрузки", date.today().isoformat()],
        ["Курс CNY → ₽ (из свода, BS1)", rate],
        ["Коэффициент накладных (из свода, BT1)", coef],
        ["Сумма, ₽", "Сумма CNY × курс × коэффициент"],
        ["Лучшая цена", "Минимальная цена за разъём среди предложений с артикулом поставщика; "
                        "если таких нет — среди всех предложений (с замечанием)"],
        ["Согласовано", "Зелёная заливка модели на листе «План разработок»"],
        ["Источник проектов", "sources/Plan_razrabotok_Ozon.xlsx, лист «План разработок»"],
        ["Источник цен", f"sources/Svod_cen_postavshikov.xlsx, лист «{PRICE_SHEET}»"],
        ["Сверка с чертежами", "specs/Summary_all_drawings.xlsx, лист «Все разъёмы»"],
    ], [40, 90])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    wb.save(OUT)
    print(f"Saved {OUT}: {len(up_rows)} строк загрузки, {len(proj_rows)} проектов, {len(offer_rows)} предложений, "
          f"{len(remarks)} замечаний")


if __name__ == "__main__":
    main()
