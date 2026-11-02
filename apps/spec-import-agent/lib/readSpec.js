/**
 * Чтение одного файла спецификации чертежа (specs/Wiring_N/Wiring_N_spec.xlsx,
 * генерируется tools/build_specs.py). Возвращает «сырые» данные чертежа —
 * без привязки к API, чтобы разбор можно было проверить тестами отдельно.
 *
 * Используемые листы:
 *   «Чертёж»   — № чертежа, марка, модель, список листов;
 *   «BOM»      — позиции спецификации (P/N, наименование, кол-во, ед., статус);
 *   «Каталог»  — описание каждого P/N (производитель, серия, сечения, аналог, источник);
 *   «Разъёмы», «Распиновка», «Замечания» — таблицы чертежа для вкладки
 *                «Электросхемы» проекта.
 */
import XLSX from "xlsx";

const EMPTY = new Set(["", "—", "-", "?"]);

/** Как clean, но «—» оставляет как есть — для полей, где прочерк значим (пин, обозначение). */
function text(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

export function clean(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return EMPTY.has(s) ? null : s;
}

function sheetRows(wb, name) {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils
    .sheet_to_json(ws, { defval: null, raw: true })
    .filter((row) => Object.values(row).some((v) => v !== null && String(v).trim() !== ""));
}

export function readSpecWorkbook(wb, sourceFile = "") {
  const drawingSheet = wb.Sheets["Чертёж"];
  if (!drawingSheet) throw new Error(`${sourceFile}: нет листа «Чертёж» — это не файл спецификации`);
  if (!wb.Sheets["BOM"]) throw new Error(`${sourceFile}: нет листа «BOM»`);

  const params = {};
  const sheets = [];
  for (const row of XLSX.utils.sheet_to_json(drawingSheet, { header: 1, defval: null })) {
    const [key, value] = row;
    if (!key) continue;
    const k = String(key).trim();
    if (k.startsWith("Лист ")) sheets.push({ sheet: k.slice(5).trim(), description: clean(value) });
    else params[k] = value;
  }

  const drawingNo = Number(params["№ чертежа"]);
  const brand = clean(params["Марка"]);
  const model = clean(params["Модель"]);
  if (!Number.isFinite(drawingNo) || !brand || !model) {
    throw new Error(`${sourceFile}: на листе «Чертёж» не заполнены «№ чертежа»/«Марка»/«Модель»`);
  }

  const catalog = {};
  for (const r of sheetRows(wb, "Каталог")) {
    const pn = clean(r["P/N"]);
    if (!pn) continue;
    catalog[pn] = {
      manufacturer: clean(r["Производитель"]),
      series: clean(r["Серия"]),
      description: clean(r["Описание"]),
      crossSection: clean(r["Сечение, мм²"]),
      status: clean(r["Статус"]),
      analog: clean(r["Аналог / комментарий"]),
      source: clean(r["Источник"]),
    };
  }

  const bom = [];
  for (const r of sheetRows(wb, "BOM")) {
    const name = clean(r["Наименование"]);
    if (!name) continue;
    const qty = Number(String(r["Кол-во"] ?? "").replace(",", "."));
    bom.push({
      sheet: clean(r["Лист"]) ?? "",
      position: r["Поз."] ?? null,
      name,
      pn: clean(r["P/N"]),
      manufacturer: clean(r["Производитель"]),
      quantity: Number.isFinite(qty) && qty > 0 ? qty : null,
      unit: clean(r["Ед."]) ?? "шт",
      status: clean(r["Статус"]),
    });
  }

  return {
    sourceFile,
    drawingNo,
    brand,
    model,
    sheets,
    catalog,
    bom,
    connectors: sheetRows(wb, "Разъёмы")
      .map((r) => ({
        sheet: text(r["Лист"]) ?? "",
        designator: text(r["Разъём"]),
        bomPosition: text(r["Поз. BOM"]),
        purpose: clean(r["Назначение"]),
        housingPn: clean(r["P/N корпуса"]),
        manufacturer: clean(r["Производитель"]),
        positions: clean(r["Позиций"]),
        contactPn: clean(r["Контакт (P/N)"]),
        contactQty: clean(r["Контактов, шт"]),
        status: clean(r["Статус"]),
        note: clean(r["Примечание"]),
      }))
      .filter((c) => c.designator),
    pins: sheetRows(wb, "Распиновка")
      .map((r) => ({
        sheet: text(r["Лист"]) ?? "",
        connector: text(r["Разъём"]),
        housingPn: clean(r["P/N корпуса"]),
        contactPn: clean(r["Контакт"]),
        pin: text(r["Пин"]),
        wire: clean(r["Провод №"]),
        color: clean(r["Цвет"]),
        crossSection: clean(r["Сечение, мм²"]),
        destination: clean(r["Куда идёт"]),
        doubleCrimp: /^да$/i.test(String(r["Двойной обжим"] ?? "").trim()),
        crossSectionCheck: clean(r["Проверка сечения"]),
        note: clean(r["Примечание"]),
      }))
      .filter((p) => p.connector),
    notes: sheetRows(wb, "Замечания")
      .map((r, i) => ({
        number: Number.isInteger(Number(r["№"])) ? Number(r["№"]) : i + 1,
        topic: clean(r["Тема"]),
        text: text(r["Замечание"]),
        recommendation: clean(r["Рекомендация"]),
      }))
      .filter((n) => n.text),
  };
}

export function readSpecFile(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  return readSpecWorkbook(wb, filePath);
}
