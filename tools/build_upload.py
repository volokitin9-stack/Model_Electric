"""Собирает итоговый файл загрузки в проект модельной электрики.

Источники (sources/):
  Plan_razrabotok_Ozon.xlsx    — «План разработок» (зелёная заливка модели = согласовано в работу), продажи Ozon;
  Svod_cen_postavshikov.xlsx   — свод цен поставщиков разъёмов, лист «Лист1 (2)» (8 поставщиков).
Сверка артикулов — с specs/Summary_all_drawings.xlsx (лист «Все разъёмы»).

Запуск из корня репозитория:  python3 tools/build_upload.py
Результат: export/Model_Electric_upload.xlsx
"""
import json
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
# Машиночитаемая версия для apps/spec-import-agent (этап «Свод цен»)
OUT_JSON = os.path.join(ROOT, "export", "price_import.json")

PRICE_SHEET = "Лист1 (2)"
SUPPLIERS = ["Ylcn", "HD Connector", "JINGMING", "Star technology", "Jiangsu Xing Yao Electric",
             "YBConnector", "QCLNC", "OLT"]
MALE_OEM, FEMALE_OEM = "C", "AK"
MALE_START, FEMALE_START = ci("E"), ci("AM")  # по 4 колонки на поставщика: артикул, MOQ, цена, итого
GREEN = "FF92D050"
# Предварительное решение (готово, но требует подтверждения)
PRELIM = {17: "AMP 1-929592-1: ответная часть не найдена, предварительно разъёмы как у Largus 2012-2021"}

# Артикулы свода, близкие к чертежу, но не совпадающие: нормализованный OEM -> пояснение
NEAR = {
    "1749221": "в чертеже №2 174922-2: суффикс -1/-2 — другой тип (кодировка) корпуса, проверить",
    "1749291": "в чертеже №2 174929-2: суффикс -1/-2 — другой тип (кодировка) корпуса, проверить",
    "5G0972715": "в чертеже №6 5K0972715: другой номер VAG (5G0 vs 5K0), проверить совместимость",
}

# Блоки свода цен: основная строка -> доп. строка (второй разъём комплекта), имя блока
PRICE_BLOCKS = {4: 5, 6: 7, 8: 9}

# Строки «Плана разработок» -> (№ чертежей, варианты комплекта, замечание).
# Вариант: (название, [строка блока свода | (строка блока, строка разъёма)]). Первый вариант — основной,
# по нему считается себестоимость; остальные — альтернативы.
KIT = "комплект"
GRANTA_TE = "Вариант 1: по чертежу TE 1-929621-1 / 1-929627-1 (цены из строки Chevrolet Niva)"
GRANTA_VAG = "Вариант 2: по своду 3C0 972 733 / 1J0 972 926"
GRANTA_NOTE = ("Два варианта разъёмов: чертёж — TE 1-929621-1 / 1-929627-1 (= 19296211 / 19296271, цены из строки "
               "Chevrolet Niva), свод — 3C0 972 733 / 1J0 972 926. Какой верный — подтвердить")
PLAN_MAP = {
    5: ([4], [(GRANTA_TE, [21]), (GRANTA_VAG, [16])], "Не согласовано. " + GRANTA_NOTE),
    7: ([5], [(KIT, [14])], "Не согласовано; уточнить исполнение Niva Travel"),
    9: ([2], [(KIT, [8])], "Не согласовано; разъёмы как у Vesta NG"),
    12: ([5], [(KIT, [14])], "Чертёж №5: 191972716 / 1J0972706"),
    13: ([12], [(KIT, [21])], "Чертёж №12 на TE 1-929627-1 = 19296271 (строка свода Chevrolet Niva), а не 191972716"),
    14: ([11], [(KIT, [18])], "Чертёж №11: колодки 2105-3724341"),
    15: ([1], [(KIT, [17])], "Чертёж №1: 928522-1"),
    16: ([9], [(KIT, [19])], ""),
    17: ([10], [(KIT, [19])], "AMP 1-929592-1 (свод, стр. 12): ответная часть не подобрана. Предварительно разъёмы "
                              "одинаковые с Largus 2012-2021 — взяты Molex 98821/98825-1061 (стр. 19), подтвердить"),
    18: ([4], [(GRANTA_TE, [21]), (GRANTA_VAG, [16])], GRANTA_NOTE),
    19: ([8], [(GRANTA_TE, [21]), (GRANTA_VAG, [16])], GRANTA_NOTE),
    20: ([4], [(GRANTA_TE, [21]), (GRANTA_VAG, [16])], GRANTA_NOTE),
    21: ([2], [(KIT, [8])], "ВНИМАНИЕ: свод 174922-1 / 174929-1, чертёж 174922-2 / 174929-2 — "
                            "суффикс -1/-2 означает другой тип (кодировку) корпуса, проверить"),
    22: ([3], [(KIT, [20, (4, 5)])], "2-поз. Yazaki 7282/7283-8851-30 взят из блока Haval Dargo (свод, стр. 5)"),
    23: ([7], [(KIT, [21])], "19296271 / 19296211 = TE 1-929627-1 / 1-929621-1"),
    29: ([], [(KIT, [4])], ""),
    30: ([], [(KIT, [6])], ""),
    31: ([], [(KIT, [22])], ""),
    33: ([], [(KIT, [10])], "Female в своде цен не указан"),
    34: ([], [(KIT, [11])], ""),
    37: ([], [(KIT, [15]), ("альтернатива: Molex 98821/98825-1061", [19])],
         "Альтернатива: Molex 98821/98825-1061 (строка Largus/Logan 2)"),
    39: ([6], [(KIT, [13])], "ВНИМАНИЕ: свод male 5G0972715, чертёж №6 5K0972715 — другой номер VAG, "
                             "проверить совместимость"),
}

HDR = PatternFill("solid", fgColor="1F4E78")
OKF = PatternFill("solid", fgColor="E2EFDA")
WARN = PatternFill("solid", fgColor="FFF2CC")
BAD = PatternFill("solid", fgColor="F8CBAD")
ALTF = PatternFill("solid", fgColor="DDEBF7")
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
                    kit_total = num(ws.cell(rr, c + 3).value)  # «Итого на комплект проводки» из свода (по основной строке)
                    if price is None and art is None:
                        continue
                    note = []
                    if art is None:
                        note.append("нет артикула поставщика")
                    if price is None:
                        note.append("нет цены")
                    if moq is None and price is not None:
                        note.append("нет MOQ")
                    offers.append(dict(sup=sup, art=art, moq=moq, price=price, kit=kit_total, note="; ".join(note)))
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
        gen = clean(ws[f"D{r}"].value)
        gen = re.sub(r"\s*-\s*", "-", gen) if gen else gen
        res.append(dict(row=r, group=group, brand=b, model=c, gen=gen,
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
    json_projects = []
    for p in plan:
        jlines = []
        drawings, variants, note = PLAN_MAP.get(p["row"], ([], [], ""))
        car = f"{p['brand']} {p['model']} {p['gen'] or ''}".strip()
        kit_cny, n_lines, n_noprice, n_mismatch = 0.0, 0, 0, 0
        alt_costs = []
        for vi, (variant, entries) in enumerate(variants):
            main_v = vi == 0
            v_cny, v_ok = 0.0, True
            for ent in entries:
                br, only = (ent if isinstance(ent, tuple) else (ent, None))
                blk = blocks[br]
                for ln in blk["lines"]:
                    if only is not None and ln["row"] != only:
                        continue
                    uid += 1
                    best = best_offer(ln["offers"])
                    near = NEAR.get(norm(ln["oem"])) if ln["oem"] else None
                    if drawings and ln["oem"]:
                        hit = [d for d in drawings if norm(ln["oem"]) in dpn.get(d, set())]
                        check = f"есть в чертеже №{hit[0]}" if hit else ("отличается от чертежа" if near
                                                                       else "нет в чертеже")
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
                    if near:
                        issues.append(near)
                    elif check == "нет в чертеже":
                        issues.append("артикул не совпадает с чертежом" + ("" if main_v else " (альтернативный вариант)"))
                    if br == 4 and only == 5:
                        issues.append("разъём взят из блока Haval Dargo")
                    if not best:
                        status = "Нет цены"
                    elif issues and not (not main_v and check == "нет в чертеже" and len(issues) == 1):
                        status = "Проверить"
                    elif not main_v:
                        status = "Альтернатива"
                    else:
                        status = "OK" if check.startswith("есть") else "Нет чертежа"
                    if br == 4 and only == 5 and best and status == "Проверить" and len(issues) == 1:
                        status = "OK"
                    if best:
                        v_cny += line_cny
                    else:
                        v_ok = False
                    if main_v:
                        n_lines += 1
                        if not best:
                            n_noprice += 1
                        if check in ("нет в чертеже", "отличается от чертежа"):
                            n_mismatch += 1
                    jlines.append(dict(oem=ln["oem"], side=ln["side"], qty=ln["qty"], variant=variant, main=main_v,
                                       check=check, issue="; ".join(issues) or None,
                                       best=dict(supplier=best["sup"], article=best["art"], price=best["price"],
                                                 moq=best["moq"]) if best else None))
                    up_rows.append([
                        uid, p["group"], p["brand"], p["model"], p["gen"], "Да" if p["approved"] else "Нет",
                        ", ".join(map(str, drawings)) or None, variant, f"{blk['name']} (стр. {ln['row']})",
                        ln["side"], ln["role"], ln["oem"], ln["qty"], check,
                        best["sup"] if best else None, best["art"] if best else None, best["moq"] if best else None,
                        best["price"] if best else None, line_cny, round(line_cny * k, 2) if best else None,
                        len([o for o in ln["offers"] if o["price"] is not None]), alts or None, status,
                        "; ".join(issues) or None])
                    up_fill.append({"OK": OKF, "Нет цены": BAD, "Альтернатива": ALTF}.get(status, WARN))
            if main_v:
                kit_cny = v_cny
            else:
                alt_costs.append(f"{variant}: {round(v_cny * k, 2)} ₽" + ("" if v_ok else " (не все цены)"))
        kit_rows = [e[0] if isinstance(e, tuple) else e for e in (variants[0][1] if variants else [])]
        bt = blocks[kit_rows[0]]["bt"] if kit_rows else None
        main_entries = variants[0][1] if variants else []
        file_kit = (round(sum(blocks[e]["file_total"] for e in dict.fromkeys(main_entries)), 2)
                    if main_entries and all(isinstance(e, int) and blocks[e]["file_total"] for e in main_entries)
                    else None)
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
        if p["row"] in PRELIM:
            missing.append("предварительно: " + PRELIM[p["row"]])
        if n_mismatch:
            missing.append(f"артикулы не совпадают с чертежом: {n_mismatch} поз.")
        if len(variants) > 1:
            missing.append("выбрать вариант разъёмов")
        if not p["approved"]:
            ready = "Не в работе"
        elif drawings and kit_rows and not n_noprice and not n_mismatch:
            ready = ("Готов (предварительно)" if p["row"] in PRELIM
                     else "Готов (2 варианта)" if len(variants) > 1 else "Готов к загрузке")
        elif kit_rows or drawings:
            ready = "Частично"
        else:
            ready = "Нет данных"
        share = round(kit_rub / p["avg"] * 100, 2) if kit_rub and p["avg"] else None
        if p["approved"]:
            json_projects.append(dict(
                key=f"plan-{p['row']}", group=p["group"], brand=p["brand"], model=p["model"], gen=p["gen"],
                drawings=drawings, ready=ready, missing="; ".join(missing) or None,
                note="; ".join(x for x in (note, p["note"]) if x) or None,
                sales=dict(qty=p["qty"], sum=p["sum"], avg=p["avg"]), kitCny=round(kit_cny, 4) if kit_rub else None,
                kitRub=kit_rub, fileKitRub=file_kit, lines=[ln for ln in jlines if ln["oem"]]))
        proj_rows.append([p["group"], p["brand"], p["model"], p["gen"], "Да" if p["approved"] else "Нет",
                          p["qty"], p["sum"], p["avg"], p["kind"], ", ".join(map(str, drawings)) or None,
                          ", ".join(dict.fromkeys(blocks[r]["name"] for r in kit_rows)) or None, n_lines or None,
                          round(kit_cny, 3) if kit_rub else None, kit_rub, file_kit, "; ".join(alt_costs) or None, bt, share,
                          ready,
                          "; ".join(missing) or None, "; ".join(x for x in (note, p["note"]) if x) or None])
        proj_fill.append({"Готов к загрузке": OKF, "Готов (предварительно)": OKF, "Готов (2 варианта)": OKF,
                          "Частично": WARN,
                          "Нет данных": BAD}.get(ready))
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
                                   o["kit"], "Да" if o is best else None, o["note"] or None])

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
                 "Поставщик (лучшая цена)", "Артикул поставщика", "MOQ", "Цена разъёма (корпус + пины + допы), CNY",
                 "Сумма на комплект, CNY",
                 "Сумма на комплект, ₽", "Предложений", "Альтернативы (поставщик: артикул — цена CNY)",
                 "Статус", "Замечание"],
                up_rows, [5, 10, 11, 22, 11, 11, 9, 12, 26, 8, 9, 18, 9, 18, 22, 22, 7, 9, 11, 11, 9, 60, 10, 45],
                up_fill, first=True)
    write_sheet(wb, "Проекты",
                ["Группа", "Марка", "Модель", "Поколение", "Согласовано", "Заказано, шт", "Заказано, ₽",
                 "Ср. цена продажи, ₽", "Тип проводки", "№ чертежа", "Блок свода цен", "Позиций разъёмов",
                 "Разъёмы на комплект, CNY", "Разъёмы на комплект, ₽", "Итог на комплект по своду (как в файле), ₽",
                 "Альтернативный вариант, ₽",
                 "Цена первичный анализ, ₽",
                 "Доля разъёмов в цене продажи, %", "Готовность", "Чего не хватает", "Комментарий"],
                proj_rows, [10, 11, 28, 13, 11, 10, 12, 11, 30, 9, 26, 9, 11, 11, 13, 40, 11, 11, 15, 40, 50], proj_fill)
    write_sheet(wb, "Цены поставщиков",
                ["Блок свода цен", "Строка", "Сторона", "Роль", "OEM артикул", "Кол-во на комплект", "Поставщик",
                 "Артикул поставщика", "MOQ", "Цена разъёма (корпус + пины + допы), CNY", "Сумма на комплект, CNY",
                 "Итого на комплект проводки (из свода), CNY", "Лучшая", "Замечание"],
                offer_rows, [26, 7, 8, 9, 18, 9, 24, 24, 7, 12, 11, 13, 8, 35])
    write_sheet(wb, "Замечания", ["Раздел", "Объект", "Замечание"], remarks, [12, 30, 100])
    write_sheet(wb, "Параметры", ["Параметр", "Значение"], [
        ["Дата выгрузки", date.today().isoformat()],
        ["Курс CNY → ₽ (из свода, BS1)", rate],
        ["Коэффициент накладных (из свода, BT1)", coef],
        ["Сумма, ₽", "Сумма CNY × курс × коэффициент"],
        ["Цена разъёма в своде", "Комплект на один разъём: корпус + пины + необходимые допы. Пины и допы "
                                 "отдельно не оцениваются (в проекте — плановая цена 0, «входит в цену разъёма»)"],
        ["Итог на комплект по своду", "«Итого на комплект проводки» из свода: кол-во × цена основного разъёма + "
                                      "доп. разъём; итог свода = (male + female) × курс × коэффициент"],
        ["Лучшая цена", "Минимальная цена за разъём среди предложений с артикулом поставщика; "
                        "если таких нет — среди всех предложений (с замечанием)"],
        ["Согласовано", "Зелёная заливка модели на листе «План разработок»"],
        ["Источник проектов", "sources/Plan_razrabotok_Ozon.xlsx, лист «План разработок»"],
        ["Источник цен", f"sources/Svod_cen_postavshikov.xlsx, лист «{PRICE_SHEET}»"],
        ["Сверка с чертежами", "specs/Summary_all_drawings.xlsx, лист «Все разъёмы»"],
    ], [40, 90])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    wb.save(OUT)
    offers, seen = [], set()
    for blk in blocks.values():
        for ln in blk["lines"]:
            if not ln["oem"]:
                continue
            for o in ln["offers"]:
                if o["price"] is None:
                    continue
                key = (norm(ln["oem"]), o["sup"], o["art"])
                if key in seen:
                    continue
                seen.add(key)
                offers.append(dict(oem=ln["oem"], side=ln["side"], supplier=o["sup"], article=o["art"],
                                   moq=int(o["moq"]) if o["moq"] else None, price=o["price"], note=o["note"] or None))
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(dict(generatedAt=date.today().isoformat(), currency="CNY", rate=rate, coef=coef,
                       source=f"sources/Svod_cen_postavshikov.xlsx «{PRICE_SHEET}», sources/Plan_razrabotok_Ozon.xlsx",
                       suppliers=SUPPLIERS, offers=offers, projects=json_projects), f, ensure_ascii=False, indent=1)
    print(f"Saved {OUT}: {len(up_rows)} строк загрузки, {len(proj_rows)} проектов, {len(offer_rows)} предложений, "
          f"{len(remarks)} замечаний")


if __name__ == "__main__":
    main()
