import * as XLSX from "xlsx";

export type ColumnMapping = {
  ourArticle?: number; // 0-based индекс колонки
  supplierArticle: number;
  price?: number;
  currency?: number;
  availability?: number;
  moq?: number;
  leadTimeDays?: number;
};

export type ParseConfig = {
  sheetName?: string | null;
  headerRow: number; // 1-based, как в профиле (строка заголовков)
  dataStartRow: number; // 1-based, первая строка данных
  columnMapping: ColumnMapping;
};

export type ParsedRow = {
  rowNumber: number; // исходный номер строки в файле (для сообщений об ошибках)
  ourArticle: string | null;
  supplierArticle: string | null;
  price: string | null; // как в файле, без приведения типа — валидация отдельно
  currency: string | null;
  availability: string | null;
  moq: string | null;
  leadTimeDays: string | null;
};

export type SheetInfo = { sheetNames: string[]; headers: string[]; sampleRows: string[][] };

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 МБ — защита от огромных файлов
const SUPPORTED_EXT = [".xlsx", ".xls", ".csv"];

export function assertSupportedFile(filename: string, size: number) {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  if (!SUPPORTED_EXT.includes(ext)) {
    throw new Error(`Неподдерживаемый формат файла: ${ext}. Поддерживаются XLSX, XLS, CSV`);
  }
  if (size > MAX_FILE_BYTES) {
    throw new Error(`Файл слишком большой (${(size / 1024 / 1024).toFixed(1)} МБ) — максимум 15 МБ`);
  }
}

function cellToString(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

/** Читает книгу (xlsx/xls/csv — SheetJS определяет формат по содержимому). */
function readWorkbook(buffer: Buffer): XLSX.WorkBook {
  // cellDates: даты как Date, а не серийное число Excel; raw: false — строки уже
  // приведены к отображаемому виду (важно для артикулов с ведущими нулями).
  return XLSX.read(buffer, { type: "buffer", cellDates: true });
}

/** Для шага настройки шаблона: список листов, заголовки и несколько строк превью. */
export function inspectFile(buffer: Buffer, sheetName?: string | null): SheetInfo {
  const wb = readWorkbook(buffer);
  const name = sheetName && wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  const headers = (rows[0] ?? []).map(cellToString);
  const sampleRows = rows.slice(1, 6).map((r) => (r as unknown[]).map(cellToString));
  return { sheetNames: wb.SheetNames, headers, sampleRows };
}

/** Полный разбор файла по сохранённому/черновому профилю сопоставления колонок. */
export function parseRows(buffer: Buffer, config: ParseConfig): ParsedRow[] {
  const wb = readWorkbook(buffer);
  const name = config.sheetName && wb.SheetNames.includes(config.sheetName) ? config.sheetName : wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });

  const startIdx = Math.max(0, config.dataStartRow - 1);
  const m = config.columnMapping;
  const out: ParsedRow[] = [];

  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row || row.every((c) => cellToString(c) === "")) continue; // пустая строка — пропуск

    const get = (idx?: number) => (idx != null && row[idx] != null ? cellToString(row[idx]) : null);
    out.push({
      rowNumber: i + 1,
      ourArticle: get(m.ourArticle) || null,
      supplierArticle: get(m.supplierArticle) || null,
      price: get(m.price) || null,
      currency: get(m.currency) || null,
      availability: get(m.availability) || null,
      moq: get(m.moq) || null,
      leadTimeDays: get(m.leadTimeDays) || null,
    });
  }
  return out;
}
