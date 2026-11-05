import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  diffProjectLine,
  lineStatus,
  matchCatalog,
  matchPriceProject,
  nextSupplierCode,
  oemKey,
  samePrice,
  uniqueLines,
} from "../lib/prices.js";

const PRICES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "export", "price_import.json");

test("oemKey: один номер в разной записи совпадает, контакт — нет", () => {
  assert.equal(oemKey("19296271"), oemKey("1-929627-1"));
  assert.equal(oemKey("7282885130"), oemKey("7282-8851-30"));
  assert.equal(oemKey("2105-3724341"), oemKey("21053724341 (White)"));
  assert.equal(oemKey("AMP 1-929592-1"), oemKey("1-929592-1"));
  assert.equal(oemKey("3C0 972 733"), "3C0972733");
  assert.notEqual(oemKey("Контакт для 191972716"), oemKey("191972716"));
  assert.notEqual(oemKey("174922-1"), oemKey("174922-2"));
});

test("matchCatalog: колодка 2105-3724341 находит обе позиции чертежа (белую и чёрную)", () => {
  const catalog = [
    { id: "w", internalArticle: "21053724341 (White)" },
    { id: "b", internalArticle: "21053724341 (Black)" },
    { id: "c", internalArticle: "Контакт для 21053724341" },
  ];
  assert.deepEqual(matchCatalog(catalog, "2105-3724341").map((c) => c.id), ["w", "b"]);
  assert.deepEqual(matchCatalog(catalog, "999"), []);
});

test("nextSupplierCode продолжает нумерацию SUPnn", () => {
  assert.equal(nextSupplierCode([{ code: "SUP01" }, { code: "SUP02" }, { code: "SUP03" }]), "SUP04");
  assert.equal(nextSupplierCode([]), "SUP01");
});

test("matchPriceProject: привязка → чертёж → артикул → новый", () => {
  const projects = [
    { id: "p1", name: "Lada Granta SD LB SW — проводка ТСУ", article: "ME-LADA-GRANTA-SD-LB-SW" },
    { id: "p2", name: "Haval Jolion — проводка ТСУ", article: "ME-HAVAL-JOLION" },
    { id: "p3", name: "Toyota Land Cruiser 200 — проводка ТСУ", article: "ME-TOYOTA-LC200" },
  ];
  const drawings = [{ drawingNo: 4, projectId: "p1" }];
  const e = (o) => ({ key: "plan-1", brand: "Lada", model: "X", gen: null, drawings: [], ...o });
  assert.equal(matchPriceProject(projects, drawings, e({ drawings: [4] })).project.id, "p1");
  assert.equal(matchPriceProject(projects, drawings, e({ drawings: [8] })).by, "drawing-pending");
  assert.equal(matchPriceProject(projects, drawings, e({ brand: "Haval", model: "Jolion" })).project.id, "p2");
  const lc = matchPriceProject(projects, drawings, e({ key: "plan-34", brand: "Toyota", model: "Land Cruiser 200" }), {
    "plan-34": "ME-TOYOTA-LC200",
  });
  assert.equal(lc.project.id, "p3");
  const m = matchPriceProject(projects, drawings, e({ brand: "Haval", model: "Dargo", gen: "2022-" }));
  assert.equal(m.by, "new");
  assert.equal(m.planned.article, "ME-HAVAL-DARGO");
  assert.equal(m.planned.name, "Haval Dargo 2022- — проводка ТСУ");
});

test("статусы и правка позиции: человека не перетираем", () => {
  const main = { main: true, variant: "комплект", best: { supplier: "HD", article: "A", price: 1.5 }, check: "есть в чертеже №2" };
  assert.equal(lineStatus(main), "selected");
  assert.equal(lineStatus({ ...main, issue: "артикул не совпадает с чертежом" }), "needs_review");
  assert.equal(lineStatus({ ...main, main: false }), "not_required");

  const fresh = diffProjectLine({ primaryOfferId: null, plannedPrice: null, comment: null }, main, "x1");
  assert.equal(fresh.primaryOfferId, "x1");
  assert.equal(fresh.plannedPrice, 1.5);
  assert.equal(fresh.plannedCurrency, "CNY");
  assert.match(fresh.comment, /^Свод цен:/);

  const manual = diffProjectLine({ primaryOfferId: "y", plannedPrice: "2", comment: "ручной комментарий" }, main, "x1");
  assert.deepEqual(manual, {});
});

test("uniqueLines: основной вариант важнее альтернативы, samePrice учитывает MOQ", () => {
  const lines = uniqueLines([
    { oem: "3C0 972 733", main: false },
    { oem: "3C0972733", main: true },
    { oem: null, main: true },
  ]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].main, true);
  assert.equal(samePrice({ price: "1.2", currency: "CNY", minimumOrderQuantity: 200 }, { price: 1.2, moq: 200 }), true);
  assert.equal(samePrice({ price: "1.2", currency: "CNY", minimumOrderQuantity: 100 }, { price: 1.2, moq: 200 }), false);
  assert.equal(samePrice(null, { price: 1 }), false);
});

test("export/price_import.json: согласованные проекты и цены в CNY", { skip: !fs.existsSync(PRICES) }, () => {
  const data = JSON.parse(fs.readFileSync(PRICES, "utf8"));
  assert.equal(data.currency, "CNY");
  assert.equal(data.suppliers.length, 8);
  assert.ok(data.offers.every((o) => o.oem && o.supplier && typeof o.price === "number"));
  const granta = data.projects.find((p) => p.model === "Granta SE");
  assert.deepEqual(granta.drawings, [4]);
  assert.ok(granta.lines.some((l) => !l.main), "у Granta есть альтернативный вариант разъёмов");
  const iskra = data.projects.find((p) => p.model === "Iskra");
  assert.ok(iskra.lines.some((l) => oemKey(l.oem) === oemKey("7282-8851-30")), "у Iskra есть 2-поз. Yazaki");
});

test("coveredContacts: пины входят в цену разъёма, только если все их разъёмы есть в своде", async () => {
  const { coveredContacts } = await import("../lib/prices.js");
  const connectors = [
    { housingPn: "1-929621-1", contactPn: "927771-3" },
    { housingPn: "—", contactPn: "927771-3" }, // отдельный пин без корпуса — не мешает
    { housingPn: "174922-2", contactPn: "173631-1" }, // корпус -2 в своде нет
    { housingPn: "7282-8851-30", contactPn: "не указан" },
    { housingPn: "1-929627-1", contactPn: "962883-1" },
    { housingPn: "L-KLS1-4.20-2X08-MH", contactPn: "962883-1" }, // этот корпус без цены
  ];
  const priced = new Set([oemKey("19296211"), oemKey("174922-1"), oemKey("7282885130"), oemKey("1-929627-1")]);
  const covered = coveredContacts(connectors, priced);
  assert.deepEqual([...covered.keys()], [oemKey("927771-3")]);
  assert.deepEqual(covered.get(oemKey("927771-3")), ["1-929621-1"]);
});

test("комментарий из чертежа сохраняет хвост «| Свод цен: …» при обновлении", async () => {
  const { diffProjectComponents, PRICE_TAIL } = await import("../lib/plan.js");
  const item = { key: "927771-3", internalArticle: "927771-3", quantity: 12, status: "confirmed", projectComment: "Чертёж №4: новое" };
  const row = (comment) => ({ id: "r", quantity: 12, status: "confirmed", comment, component: { internalArticle: "927771-3" } });
  const same = diffProjectComponents([row(`Чертёж №4: новое${PRICE_TAIL} входит в цену`)], [item]);
  assert.equal(same.update.length, 0);
  const changed = diffProjectComponents([row(`Чертёж №4: старое${PRICE_TAIL} входит в цену`)], [item]);
  assert.equal(changed.update[0].patch.comment, `Чертёж №4: новое${PRICE_TAIL} входит в цену`);
});

test("Ozon: объединение топа по проекту и правила обновления конкурентов", async () => {
  const { mergeOzon, diffCompetitors } = await import("../lib/prices.js");
  const o = (url, qty, seller = "S") => ({ url, qty, sum: qty * 100, seller, product: `P${url}`, price: 100, comment: `Ozon #9: заказано ${qty} шт` });
  const top = mergeOzon([[o("a", 5), o("b", 46)], [o("b", 46), o("c", 1)]], 2);
  assert.deepEqual(top.map((x) => x.url), ["b", "a"]);
  assert.match(top[0].comment, /^Ozon #1:/);
  assert.match(top[1].comment, /^Ozon #2:/);

  const current = [
    { id: "1", productUrl: "b", sellerName: "S", productName: "Pb", price: "100", comment: top[0].comment }, // без изменений
    { id: "2", productUrl: "a", sellerName: "S", productName: "Pa", price: "90", comment: "Ozon #3: старое" }, // своё — обновить
    { id: "3", productUrl: "x", sellerName: "Ручной", productName: "X", price: null, comment: "мой комментарий" }, // ручное — не трогать
    { id: "4", productUrl: "z", sellerName: "S", productName: "Pz", price: "1", comment: "Ozon #5: выпал" }, // своё, выпал — удалить
  ];
  const d = diffCompetitors(current, top);
  assert.equal(d.create.length, 0);
  assert.deepEqual(d.update.map((u) => u.row.id), ["2"]);
  assert.deepEqual(d.remove.map((r) => r.id), ["4"]);
  assert.equal(diffCompetitors([], top).create.length, 2);
});

test("export/price_import.json: у согласованных проектов есть топ продавцов Ozon", { skip: !fs.existsSync(PRICES) }, () => {
  const data = JSON.parse(fs.readFileSync(PRICES, "utf8"));
  const niva = data.projects.find((p) => p.brand === "Chevrolet" && p.model === "Niva");
  assert.ok(niva.ozon.length > 0 && niva.ozon.length <= 5);
  assert.ok(niva.ozon.every((x) => x.url.startsWith("https://www.ozon.ru/") && x.seller));
  assert.ok(niva.ozon[0].qty >= niva.ozon.at(-1).qty);
});
