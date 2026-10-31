import { prisma } from "../db.js";
import { normalizeArticle } from "../normalize.js";
import type { ParsedRow } from "./parseFile.js";

function parsePrice(raw: string | null): number | null {
  if (!raw) return null;
  const normalized = raw.replace(/\s/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseInt0(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/\s/g, ""));
  return Number.isInteger(n) && n >= 0 ? n : null;
}

const AVAILABILITY_MAP: Record<string, string> = {
  "да": "yes", "yes": "yes", "1": "yes", "есть": "yes", "в наличии": "yes",
  "нет": "no", "no": "no", "0": "no", "отсутствует": "no",
  "под заказ": "on_order", "заказ": "on_order", "on_order": "on_order",
};
function normalizeAvailability(raw: string | null): string | null {
  if (!raw) return null;
  return AVAILABILITY_MAP[raw.trim().toLowerCase()] ?? null;
}

export type DiffRow = Record<string, unknown>;
export type ImportDiff = {
  newLinks: DiffRow[];
  priceUpdates: DiffRow[];
  noChange: DiffRow[];
  unknownArticles: DiffRow[];
  orphanPrices: DiffRow[];
  duplicates: DiffRow[];
  errors: DiffRow[];
  counts: Record<string, number>;
};

/**
 * Классифицирует строки файла относительно текущего состояния базы.
 * Ничего не изменяет — только анализ для предпросмотра (§17.1).
 */
export async function buildImportDiff(supplierId: string, rows: ParsedRow[]): Promise<ImportDiff> {
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) throw new Error("Поставщик не найден");

  const catalog = await prisma.componentCatalog.findMany({ select: { id: true, internalArticle: true, name: true } });
  const catalogByNormalized = new Map(catalog.map((c) => [normalizeArticle(c.internalArticle), c]));

  const existingXrefs = await prisma.supplierCrossReference.findMany({
    where: { supplierId },
    include: { component: true, prices: { orderBy: { effectiveAt: "desc" }, take: 1 } },
  });
  const xrefByArticle = new Map(existingXrefs.map((x) => [normalizeArticle(x.supplierArticle), x]));

  const result: ImportDiff = {
    newLinks: [], priceUpdates: [], noChange: [], unknownArticles: [],
    orphanPrices: [], duplicates: [], errors: [], counts: {},
  };

  const seenInFile = new Set<string>();

  for (const row of rows) {
    if (!row.supplierArticle) {
      result.errors.push({ rowNumber: row.rowNumber, reason: "Нет артикула поставщика" });
      continue;
    }
    const supplierArticleNorm = normalizeArticle(row.supplierArticle);
    const dedupeKey = `${supplierArticleNorm}::${row.ourArticle ? normalizeArticle(row.ourArticle) : ""}`;
    if (seenInFile.has(dedupeKey)) {
      result.duplicates.push({ rowNumber: row.rowNumber, supplierArticle: row.supplierArticle, ourArticle: row.ourArticle });
      continue;
    }
    seenInFile.add(dedupeKey);

    const price = parsePrice(row.price);
    if (row.price && price == null) {
      result.errors.push({ rowNumber: row.rowNumber, reason: `Некорректная цена: "${row.price}"` });
      continue;
    }
    const currency = row.currency || supplier.defaultCurrency;
    const availability = normalizeAvailability(row.availability);
    const moq = parseInt0(row.moq);
    const leadTimeDays = parseInt0(row.leadTimeDays);

    const existingXref = xrefByArticle.get(supplierArticleNorm);

    if (existingXref) {
      if (row.ourArticle) {
        const resolved = catalogByNormalized.get(normalizeArticle(row.ourArticle));
        if (resolved && resolved.id !== existingXref.componentId) {
          result.errors.push({
            rowNumber: row.rowNumber,
            reason: `Артикул поставщика ${row.supplierArticle} уже привязан к другому нашему артикулу (${existingXref.component.internalArticle})`,
          });
          continue;
        }
      }
      const currentPrice = existingXref.prices[0];
      if (price == null) {
        result.noChange.push({
          rowNumber: row.rowNumber, supplierArticle: row.supplierArticle,
          ourArticle: existingXref.component.internalArticle, note: "В файле нет цены — кроссировка не меняется",
        });
      } else if (!currentPrice || currentPrice.price.toNumber() !== price || currentPrice.currency !== currency) {
        result.priceUpdates.push({
          rowNumber: row.rowNumber, crossReferenceId: existingXref.id,
          supplierArticle: row.supplierArticle, ourArticle: existingXref.component.internalArticle,
          oldPrice: currentPrice ? currentPrice.price.toFixed(2) : null, oldCurrency: currentPrice?.currency ?? null,
          newPrice: price.toFixed(2), currency, availability, moq, leadTimeDays,
        });
      } else {
        result.noChange.push({
          rowNumber: row.rowNumber, supplierArticle: row.supplierArticle,
          ourArticle: existingXref.component.internalArticle, price: price.toFixed(2), currency,
        });
      }
      continue;
    }

    // Новой кроссировки для этого артикула поставщика ещё нет.
    if (!row.ourArticle) {
      result.orphanPrices.push({
        rowNumber: row.rowNumber, supplierArticle: row.supplierArticle,
        reason: "Нет кроссировки и не указан наш артикул — некуда привязать цену",
      });
      continue;
    }
    const resolved = catalogByNormalized.get(normalizeArticle(row.ourArticle));
    if (!resolved) {
      result.unknownArticles.push({
        rowNumber: row.rowNumber, ourArticle: row.ourArticle, supplierArticle: row.supplierArticle,
        reason: "Такого внутреннего артикула нет в каталоге",
      });
      continue;
    }
    result.newLinks.push({
      rowNumber: row.rowNumber, ourArticle: resolved.internalArticle, componentId: resolved.id,
      componentName: resolved.name, supplierArticle: row.supplierArticle,
      price: price != null ? price.toFixed(2) : null, currency, availability, moq, leadTimeDays,
    });
  }

  result.counts = {
    newLinks: result.newLinks.length,
    priceUpdates: result.priceUpdates.length,
    noChange: result.noChange.length,
    unknownArticles: result.unknownArticles.length,
    orphanPrices: result.orphanPrices.length,
    duplicates: result.duplicates.length,
    errors: result.errors.length,
    totalRows: rows.length,
  };
  return result;
}
