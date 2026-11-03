/**
 * Этап «Свод цен»: export/price_import.json (генерирует tools/build_upload.py
 * из свода цен поставщиков и плана разработок) → поставщики, кроссировки
 * с ценами и позиции спецификаций проектов «Модельной электрики».
 *
 * Здесь только чистые функции сопоставления — без сети, чтобы правила
 * проверялись тестами (test/prices.test.js). Сетевые вызовы — в agent.js.
 */
import { projectArticle } from "./plan.js";

/** Метка комментария позиции, которую пишет этот этап (ручные комментарии не трогаем). */
export const PRICE_COMMENT_PREFIX = "Свод цен:";

/**
 * Ключ сравнения OEM-номеров разных источников: только латиница/кириллица
 * и цифры, без уточнений в скобках (кириллица остаётся, чтобы «Контакт для
 * 191972716» не совпал с самим корпусом 191972716). Так совпадают 19296271 и 1-929627-1,
 * 7282885130 и 7282-8851-30, 2105-3724341 и «21053724341 (White)».
 * Грубее серверного normalizeArticle, поэтому дубль, который отверг бы
 * сервер, здесь всегда тоже находится.
 */
export function oemKey(raw) {
  return String(raw ?? "")
    .replace(/\(.*?\)/g, "")
    .toUpperCase()
    .replace(/^AMP\s*/, "")
    .replace(/[^0-9A-ZА-ЯЁ]/g, "");
}

/** Все позиции каталога с тем же OEM-ключом (у колодок 2105-3724341 их две — белая и чёрная). */
export function matchCatalog(catalog, oem) {
  const key = oemKey(oem);
  return key ? catalog.filter((c) => oemKey(c.internalArticle) === key) : [];
}

export function supplierByName(suppliers, name) {
  const n = name.trim().toLowerCase();
  return suppliers.find((s) => s.name.trim().toLowerCase() === n) ?? null;
}

/** Следующий свободный код поставщика в стиле существующих (SUP01, SUP02…). */
export function nextSupplierCode(suppliers) {
  const used = new Set(suppliers.map((s) => s.code));
  for (let i = 1; i < 1000; i++) {
    const code = `SUP${String(i).padStart(2, "0")}`;
    if (!used.has(code)) return code;
  }
  throw new Error("не удалось подобрать код поставщика");
}

/** Артикул поставщика; если поставщик его не указал — OEM-номер (с пометкой в отчёте). */
export function offerArticle(offer) {
  return offer.article ? String(offer.article).trim() : String(offer.oem).trim();
}

/**
 * Проект системы для строки плана: 1) явная привязка priceProjectMap,
 * 2) проект, в который загружен чертёж этой модели, 3) артикул, 4) название.
 */
export function matchPriceProject(projects, drawings, entry, priceProjectMap = {}) {
  const article = projectArticle(entry.brand, entry.model);
  const name = `${entry.brand} ${entry.model}${entry.gen ? ` ${entry.gen}` : ""} — проводка ТСУ`;
  const planned = { name, article };
  const find = (ref) =>
    projects.find((p) => p.id === ref) ??
    projects.find((p) => p.article && p.article.toUpperCase() === String(ref).toUpperCase()) ??
    projects.find((p) => p.name.trim().toLowerCase() === String(ref).trim().toLowerCase());

  const mapped = priceProjectMap[entry.key];
  if (mapped) return { project: find(mapped) ?? null, by: "map", mappedTo: mapped, planned };
  for (const no of entry.drawings ?? []) {
    const d = drawings.find((x) => x.drawingNo === no);
    if (d) return { project: projects.find((p) => p.id === d.projectId) ?? null, by: "drawing", drawingNo: no, planned };
    return { project: null, by: "drawing-pending", drawingNo: no, planned };
  }
  const byArticle = projects.find((p) => p.article && p.article.toUpperCase() === article);
  if (byArticle) return { project: byArticle, by: "article", planned };
  const byName = projects.find((p) => p.name.trim().toLowerCase() === name.toLowerCase());
  if (byName) return { project: byName, by: "name", planned };
  return { project: null, by: "new", planned };
}

/** Статус новой позиции спецификации из строки свода. */
export function lineStatus(line) {
  if (!line.main) return "not_required"; // альтернативный вариант — не входит в стоимость, пока не выбран
  if (line.issue && /чертеж|чертёж|совпад/i.test(line.issue)) return "needs_review";
  return "selected";
}

export function lineComment(line) {
  const parts = [`${PRICE_COMMENT_PREFIX} ${line.variant}`];
  if (line.best) {
    parts.push(`лучшая цена ${line.best.supplier} ${line.best.article ?? "(артикул не указан)"} — ${line.best.price} CNY`);
  }
  if (line.check) parts.push(line.check);
  if (line.issue) parts.push(line.issue);
  return parts.join("; ");
}

/**
 * Что поменять у позиции спецификации проекта. Количество и статус
 * существующих позиций не трогаем (источник правды — чертёж и человек);
 * заполняем только пустое: основное предложение, плановую цену, комментарий.
 */
export function diffProjectLine(row, line, offerId) {
  const patch = {};
  if (!row.primaryOfferId && offerId) patch.primaryOfferId = offerId;
  if (row.plannedPrice == null && line.best) {
    patch.plannedPrice = line.best.price;
    patch.plannedCurrency = "CNY";
  }
  const comment = lineComment(line);
  if ((!row.comment || row.comment.startsWith(PRICE_COMMENT_PREFIX)) && row.comment !== comment) patch.comment = comment;
  return patch;
}

/** Строки проекта без повторов OEM (основной вариант важнее альтернативного). */
export function uniqueLines(lines) {
  const byKey = new Map();
  for (const l of lines) {
    const k = oemKey(l.oem);
    if (!k) continue;
    const prev = byKey.get(k);
    if (!prev || (l.main && !prev.main)) byKey.set(k, l);
  }
  return [...byKey.values()];
}

export function samePrice(current, offer) {
  if (!current) return false;
  return (
    Number(current.price) === Number(offer.price) &&
    current.currency === "CNY" &&
    (current.minimumOrderQuantity ?? null) === (offer.moq ?? null)
  );
}

/**
 * Пины, стоимость которых уже входит в цену разъёма: в своде цена
 * разъёма — это комплект «корпус + пины + необходимые допы».
 * Пин считается покрытым, если каждый разъём чертежа, где он стоит,
 * есть в своде с ценой. Строки чертежа без корпуса (отдельные пины)
 * разъёму не приписываются и на решение не влияют.
 * Возвращает Map: oemKey пина -> [корпуса, в цену которых он входит].
 */
export function coveredContacts(connectors, pricedHousingKeys) {
  const byContact = new Map();
  for (const c of connectors) {
    const housing = c.housingPn && !/^[—-]$/.test(c.housingPn.trim()) ? c.housingPn.trim() : null;
    const contact = c.contactPn && !/^([—-]|не указан)$/i.test(c.contactPn.trim()) ? c.contactPn.trim() : null;
    if (!housing || !contact) continue;
    const k = oemKey(contact);
    const entry = byContact.get(k) ?? { housings: new Set(), allPriced: true };
    entry.housings.add(housing);
    if (!pricedHousingKeys.has(oemKey(housing))) entry.allPriced = false;
    byContact.set(k, entry);
  }
  const out = new Map();
  for (const [k, e] of byContact) if (e.allPriced) out.set(k, [...e.housings]);
  return out;
}

export const INCLUDED_COMMENT = (housings) =>
  `${PRICE_COMMENT_PREFIX} входит в цену разъёма ${housings.join(", ")} (цена свода = разъём + пины + допы)`;
