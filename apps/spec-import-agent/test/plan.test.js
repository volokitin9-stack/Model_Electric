import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSpecFile } from "../lib/readSpec.js";
import {
  buildDrawingPlan,
  categoryFor,
  componentStatusFromSpec,
  diffProjectComponents,
  matchProject,
  projectArticle,
  upgradedStatus,
} from "../lib/plan.js";

const SPECS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "specs");

test("чтение Wiring_1: шапка, BOM, каталог", () => {
  const spec = readSpecFile(path.join(SPECS, "Wiring_1", "Wiring_1_spec.xlsx"));
  assert.equal(spec.drawingNo, 1);
  assert.equal(spec.brand, "Lada");
  assert.equal(spec.model, "Niva Legend");
  assert.equal(spec.bom.length, 8);
  assert.equal(spec.catalog["928522-1"].manufacturer, "TE Connectivity");
  assert.equal(spec.connectors.length, 3);
  assert.equal(spec.pins.length, 11);
  assert.equal(spec.notes.length, 6);
  const pin3 = spec.pins.filter((p) => p.connector === "X1" && p.pin === "3");
  assert.equal(pin3.length, 2);
  assert.ok(pin3.every((p) => p.doubleCrimp && p.crossSectionCheck));
});

test("план содержит чертёж целиком для вкладки «Электросхемы»", () => {
  const plan = buildDrawingPlan(readSpecFile(path.join(SPECS, "Wiring_2", "Wiring_2_spec.xlsx")));
  assert.equal(plan.drawing.sourceFile, "Wiring_2/Wiring_2_spec.xlsx");
  assert.equal(plan.drawing.sheets.length, 5);
  assert.ok(plan.drawing.connectors.length > 0 && plan.drawing.pins.length > 0 && plan.drawing.notes.length > 0);
});

test("план Wiring_1: позиции, статусы, провода без P/N", () => {
  const plan = buildDrawingPlan(readSpecFile(path.join(SPECS, "Wiring_1", "Wiring_1_spec.xlsx")));
  assert.equal(plan.project.name, "Lada Niva Legend — проводка ТСУ");
  assert.equal(plan.project.article, "ME-LADA-NIVA-LEGEND");
  assert.equal(plan.project.createStatuses.searchConnectors, "in_progress");
  const byArt = Object.fromEntries(plan.items.map((i) => [i.internalArticle, i]));
  assert.equal(byArt["928522-1"].status, "confirmed");
  assert.equal(byArt["DJ451-1"].status, "searching");
  assert.equal(byArt["DJ451-1"].quantity, 7);
  const cable = plan.items.find((i) => i.unit === "м" && i.internalArticle.startsWith("Кабель 3×0.75"));
  assert.ok(cable);
  assert.equal(cable.quantity, 1.91);
  assert.equal(cable.categoryName, "Провода и кабели");
  assert.match(cable.comment, /P\/N в чертеже не указан/);
});

test("одинаковый P/N на разных листах суммируется", () => {
  const plan = buildDrawingPlan(readSpecFile(path.join(SPECS, "Wiring_2", "Wiring_2_spec.xlsx")));
  const keys = plan.items.map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length);
  const fem = plan.items.find((i) => i.internalArticle === "L-KLS1-4.20-FT");
  assert.ok(fem.occurrences.length >= 1);
  assert.equal(fem.quantity, 15);
});

test("все 12 чертежей читаются без ошибок", async () => {
  const fs = await import("node:fs");
  const dirs = fs.readdirSync(SPECS).filter((d) => /^Wiring_\d+$/.test(d));
  assert.ok(dirs.length >= 12);
  for (const d of dirs) {
    const plan = buildDrawingPlan(readSpecFile(path.join(SPECS, d, `${d}_spec.xlsx`)));
    assert.ok(plan.items.length > 0, d);
  }
});

test("статусы и категории", () => {
  assert.equal(componentStatusFromSpec("Подтверждён"), "confirmed");
  assert.equal(componentStatusFromSpec("Вероятно"), "needs_review");
  assert.equal(componentStatusFromSpec("Проверить"), "searching");
  assert.equal(componentStatusFromSpec(null), "not_defined");
  assert.equal(categoryFor("Разъём 6-поз."), "Корпуса разъёмов");
  assert.equal(categoryFor("Наконечник K2"), "Контакты и наконечники");
  assert.equal(categoryFor("Уплотнитель (grommet) D 20 мм"), "Уплотнители и заглушки");
  assert.equal(projectArticle("Lada", "Largus 2021-"), "ME-LADA-LARGUS-2021");
});

test("статус только повышается, not_required не трогаем", () => {
  assert.equal(upgradedStatus("searching", "confirmed"), "confirmed");
  assert.equal(upgradedStatus("confirmed", "searching"), null);
  assert.equal(upgradedStatus("not_required", "confirmed"), null);
});

test("сравнение со спецификацией проекта", () => {
  const items = [
    { key: "A-1", internalArticle: "A-1", quantity: 2, status: "confirmed", projectComment: "Чертёж №1: 1 поз.1 — 2 шт" },
    { key: "B-2", internalArticle: "B-2", quantity: 1, status: "searching", projectComment: "Чертёж №1: 1 поз.2 — 1 шт" },
    { key: "C-3", internalArticle: "C-3", quantity: 1, status: "searching", projectComment: "Чертёж №1: 1 поз.3 — 1 шт" },
  ];
  const existing = [
    { id: "1", component: { internalArticle: "a 1" }, quantity: "3", status: "searching", comment: "Чертёж №1: старое" },
    { id: "2", component: { internalArticle: "B-2" }, quantity: "1", status: "confirmed", comment: "ручной комментарий" },
    { id: "9", component: { internalArticle: "Z-9" }, quantity: "1", status: "not_defined", comment: null },
  ];
  const d = diffProjectComponents(existing, items);
  assert.deepEqual(d.create.map((i) => i.key), ["C-3"]);
  assert.equal(d.update.length, 1);
  assert.deepEqual(d.update[0].patch, { quantity: 2, status: "confirmed", comment: items[0].projectComment });
  assert.deepEqual(d.unchanged.map((i) => i.key), ["B-2"]);
  assert.deepEqual(d.extra.map((r) => r.id), ["9"]);
});

test("поиск проекта: привязка → артикул → название, похожие только в отчёт", () => {
  const plan = { drawingNo: 6, project: { name: "Volkswagen Polo V SD — проводка ТСУ", article: "ME-VOLKSWAGEN-POLO-V-SD" } };
  const projects = [{ id: "p1", name: "Volkswagen Polo 5 — проводка ТСУ", article: "ME-VW-POLO5" }];
  const none = matchProject(projects, plan);
  assert.equal(none.project, null);
  assert.equal(none.similar.length, 1);
  assert.equal(matchProject(projects, plan, { 6: "ME-VW-POLO5" }).project.id, "p1");
  assert.equal(matchProject(projects, plan, {}, [{ drawingNo: 6, projectId: "p1" }]).by, "drawing");
});

test("project-map.json: Polo V SD → Polo 5, Largus 2012-2021 — отдельный проект", async () => {
  const fs = await import("node:fs");
  const map = JSON.parse(fs.readFileSync(new URL("../project-map.json", import.meta.url), "utf8"));
  assert.equal(map.projectMap["6"], "ME-VW-POLO5");
  assert.ok(map.separateProjects["9"]);
  assert.equal(map.projectMap["9"], undefined);
  const projects = [{ id: "p1", name: "Volkswagen Polo 5 — проводка ТСУ", article: "ME-VW-POLO5" }];
  const plan = { drawingNo: 6, project: { name: "x", article: "y" } };
  assert.equal(matchProject(projects, plan, { 6: "me vw polo5" }).project.id, "p1");
  assert.equal(matchProject(projects, plan, { 6: "Volkswagen Polo 5 — проводка ТСУ" }).project.id, "p1");
});
