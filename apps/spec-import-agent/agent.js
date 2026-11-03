#!/usr/bin/env node
/**
 * Spec Import Agent — переносит спецификации чертежей жгутов
 * (specs/Wiring_N/Wiring_N_spec.xlsx) в проекты «Модельной электрики»
 * через тот же REST API, которым пользуется веб-интерфейс.
 *
 * Для каждого чертежа:
 *   1. находит проект (привязка из config → артикул → название) или создаёт новый;
 *   2. заводит недостающие позиции в общем каталоге комплектующих
 *      (с категорией, описанием и комментарием из листа «Каталог»);
 *   3. сверяет спецификацию проекта с BOM чертежа: добавляет новые позиции,
 *      обновляет количество, повышает статус, если P/N подтвердили;
 *   4. загружает сам чертёж — листы, разъёмы, распиновку, замечания —
 *      на вкладку «Электросхемы» проекта (целиком, если файл изменился).
 *
 * Затем этап «Свод цен» (export/price_import.json, см. lib/prices.js):
 * поставщики, кроссировки с ценами в CNY и позиции спецификаций
 * согласованных проектов (основное предложение, плановая цена).
 *
 * Запуск:  node agent.js [--apply] [--server url] [--api-key ключ] [--drawing N]
 *          [--config путь] [--specs папка] [--report файл.json] [--prune]
 *          [--prices файл.json | --no-prices]
 *
 * Без --apply — только отчёт «что будет сделано», в базе ничего не меняется.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { readSpecFile } from "./lib/readSpec.js";
import { buildDrawingPlan, diffProjectComponents, matchProject, normalizeArticle } from "./lib/plan.js";
import {
  INCLUDED_COMMENT,
  PRICE_COMMENT_PREFIX,
  coveredContacts,
  diffProjectLine,
  lineComment,
  lineStatus,
  matchCatalog,
  matchPriceProject,
  nextSupplierCode,
  offerArticle,
  oemKey,
  samePrice,
  supplierByName,
  uniqueLines,
} from "./lib/prices.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { apply: false, prune: false, drawings: [], configPath: path.join(HERE, "config.json") };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--prune") args.prune = true;
    else if (a === "--drawing") args.drawings.push(...argv[++i].split(",").map(Number));
    else if (a === "--config") args.configPath = argv[++i];
    else if (a === "--specs") args.specsFolder = argv[++i];
    else if (a === "--server") args.serverUrl = argv[++i];
    else if (a === "--api-key") args.apiKey = argv[++i];
    else if (a === "--report") args.reportPath = argv[++i];
    else if (a === "--prices") args.pricesPath = argv[++i];
    else if (a === "--no-prices") args.noPrices = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`Неизвестный аргумент: ${a} (см. --help)`);
  }
  return args;
}

function loadConfig(args) {
  const sharedPath = path.join(HERE, "project-map.json");
  const shared = fs.existsSync(sharedPath) ? JSON.parse(fs.readFileSync(sharedPath, "utf8")) : {};
  let raw = {};
  if (fs.existsSync(args.configPath)) raw = JSON.parse(fs.readFileSync(args.configPath, "utf8"));
  const specsFolder = path.resolve(
    args.configPath && fs.existsSync(args.configPath) ? path.dirname(args.configPath) : HERE,
    args.specsFolder ?? raw.specsFolder ?? path.join(HERE, "..", "..", "specs"),
  );
  return {
    serverUrl: (args.serverUrl ?? raw.serverUrl ?? process.env.ME_SERVER_URL ?? "http://localhost:4000").replace(/\/$/, ""),
    // Тот же общий ключ, что защищает весь /api/* сервера (см.
    // apps/server/src/auth.ts и переменную API_KEY на сервере).
    apiKey: args.apiKey ?? raw.apiKey ?? process.env.API_KEY ?? "",
    specsFolder,
    projectNameTemplate: raw.projectNameTemplate ?? "{brand} {model} — проводка ТСУ",
    // project-map.json (в репозитории) + projectMap из config.json (локально, приоритетнее)
    projectMap: { ...shared.projectMap, ...(raw.projectMap ?? {}) },
    separateProjects: { ...shared.separateProjects, ...(raw.separateProjects ?? {}) },
    // Привязка строк плана разработок («plan-<строка>») к существующим проектам — для этапа «Свод цен»
    priceProjectMap: { ...shared.priceProjectMap, ...(raw.priceProjectMap ?? {}) },
    pricesFile: path.resolve(
      args.configPath && fs.existsSync(args.configPath) ? path.dirname(args.configPath) : HERE,
      args.pricesPath ?? raw.pricesFile ?? path.join(HERE, "..", "..", "export", "price_import.json"),
    ),
    responsible: raw.responsible ?? null,
  };
}

function findSpecFiles(folder) {
  if (!fs.existsSync(folder)) throw new Error(`Папка со спецификациями не найдена: ${folder}`);
  const out = [];
  for (const e of fs.readdirSync(folder, { withFileTypes: true })) {
    if (!e.isDirectory() || !/^Wiring_\d+$/.test(e.name)) continue;
    const f = path.join(folder, e.name, `${e.name}_spec.xlsx`);
    if (fs.existsSync(f)) out.push(f);
  }
  return out.sort((a, b) => Number(a.match(/Wiring_(\d+)/)[1]) - Number(b.match(/Wiring_(\d+)/)[1]));
}

class Api {
  constructor(config) {
    this.base = config.serverUrl;
    this.headers = config.apiKey ? { "x-api-key": config.apiKey } : {};
  }
  async request(method, pathname, body) {
    const res = await fetch(`${this.base}${pathname}`, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...this.headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = res.status === 204 ? null : await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(`${method} ${pathname} → ${res.status}: ${data?.error ?? ""}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }
  get(p) { return this.request("GET", p); }
  post(p, b) { return this.request("POST", p, b); }
  patch(p, b) { return this.request("PATCH", p, b); }
  del(p) { return this.request("DELETE", p); }
}

const fmtQty = (n) => String(Number(n));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 20).join("\n"));
    return;
  }
  const config = loadConfig(args);
  const api = new Api(config);

  console.log(`Spec Import Agent — спецификации: ${config.specsFolder}`);
  console.log(`Сервер: ${config.serverUrl}`);
  console.log(args.apply ? "Режим: ПРИМЕНЕНИЕ изменений" : "Режим: только отчёт (для записи в базу запустите с --apply)");

  await api.get("/api/health").catch((e) => {
    throw new Error(`Сервер недоступен (${config.serverUrl}): ${e.message}`);
  });

  let files = findSpecFiles(config.specsFolder);
  const plans = [];
  for (const f of files) {
    try {
      const spec = readSpecFile(f);
      if (args.drawings.length && !args.drawings.includes(spec.drawingNo)) continue;
      plans.push(buildDrawingPlan(spec, { nameTemplate: config.projectNameTemplate }));
    } catch (e) {
      console.error(`  ✖ ${path.relative(config.specsFolder, f)}: ${e.message}`);
    }
  }
  if (plans.length === 0) console.log("Нет спецификаций для обработки.");

  // --- справочники из API ---
  const projects = await api.get("/api/projects");
  const categories = await api.get("/api/categories");
  const catalog = await api.get("/api/components");
  const drawings = await api.get("/api/drawings").catch((e) => {
    if (e.status === 404) throw new Error("на сервере нет /api/drawings — обновите сервер до версии с вкладкой «Электросхемы»");
    throw e;
  });
  if (catalog.length >= 500) {
    console.warn("⚠ API вернул 500 комплектующих (предел GET /api/components) — сопоставление по каталогу может быть неполным.");
  }
  const catalogByKey = new Map(catalog.map((c) => [normalizeArticle(c.internalArticle), c]));
  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));

  async function ensureCategory(name) {
    const hit = categoryByName.get(name.toLowerCase());
    if (hit) return hit.id;
    if (!args.apply) return null;
    const created = await api.post("/api/categories", { name });
    categoryByName.set(name.toLowerCase(), created);
    return created.id;
  }

  const report = { startedAt: new Date().toISOString(), apply: args.apply, server: config.serverUrl, drawings: [] };
  const totals = {
    drawings: 0, projectsCreated: 0, catalogCreated: 0, catalogFilled: 0, added: 0, updated: 0, extra: 0, removed: 0, errors: 0,
    suppliersCreated: 0, offersCreated: 0, pricesUpdated: 0,
  };
  const catalogPlanned = new Set(); // в режиме отчёта не считать одно и то же новое комплектующее дважды

  for (const plan of plans) {
    const r = { drawingNo: plan.drawingNo, file: path.relative(config.specsFolder, plan.sourceFile), actions: [], errors: [] };
    report.drawings.push(r);
    const log = (s) => {
      r.actions.push(s);
      console.log(`    ${s}`);
    };
    console.log(`\n№${plan.drawingNo} ${plan.project.name}  (${r.file})`);

    try {
      // 1. проект
      const m = matchProject(projects, plan, config.projectMap, drawings);
      let project = m.project;
      if (m.by === "map" && !project) throw new Error(`в projectMap указан проект "${m.mappedTo}", но в системе нет проекта с таким id, артикулом или названием`);
      if (project) {
        log(`проект найден (${m.by === "map" ? "привязка из project-map.json/config" : m.by === "drawing" ? "чертёж уже загружен в него" : m.by === "article" ? "по артикулу" : "по названию"}): ${project.name} [${project.article ?? project.id}]`);
      } else {
        if (m.similar.length && config.separateProjects[String(plan.drawingNo)]) {
          log(`отдельный проект (project-map.json): ${config.separateProjects[String(plan.drawingNo)]}`);
        } else if (m.similar.length) log(`⚠ похожие проекты: ${m.similar.join(", ")} — если это тот же, добавьте "projectMap": {"${plan.drawingNo}": "<артикул>"} в config.json`);
        log(`создать проект: ${plan.project.name} [${plan.project.article}]`);
        totals.projectsCreated++;
        if (args.apply) {
          project = await api.post("/api/projects", {
            name: plan.project.name,
            article: plan.project.article,
            responsible: config.responsible,
            ...plan.project.createStatuses,
          });
          projects.push(project);
        }
      }
      r.project = project ? { id: project.id, name: project.name, article: project.article } : { planned: plan.project };

      // 2. каталог
      for (const item of plan.items) {
        const existing = catalogByKey.get(item.key);
        if (!existing) {
          if (!catalogPlanned.has(item.key)) {
            log(`каталог + ${item.internalArticle} — ${item.name} [${item.categoryName}]`);
            totals.catalogCreated++;
            catalogPlanned.add(item.key);
          }
          if (args.apply) {
            const created = await api.post("/api/components", {
              internalArticle: item.internalArticle,
              name: item.name,
              unit: item.unit,
              categoryId: await ensureCategory(item.categoryName),
              description: item.description,
              comment: item.comment,
            });
            catalogByKey.set(item.key, created);
          }
          continue;
        }
        // Заполняем только пустые поля — правки, сделанные в вебе, не перетираем.
        const fill = {};
        if (!existing.description && item.description) fill.description = item.description;
        if (!existing.comment && item.comment) fill.comment = item.comment;
        if (!existing.categoryId) {
          const cid = await ensureCategory(item.categoryName);
          if (cid || !args.apply) fill.categoryId = cid;
        }
        if (Object.keys(fill).length && !catalogPlanned.has(`fill:${item.key}`)) {
          catalogPlanned.add(`fill:${item.key}`);
          log(`каталог ~ ${existing.internalArticle}: дополнить ${Object.keys(fill).join(", ")}`);
          totals.catalogFilled++;
          if (args.apply) Object.assign(existing, await api.patch(`/api/components/${existing.id}`, fill));
        }
      }

      // 3. спецификация проекта
      const current = project?.id ? await api.get(`/api/projects/${project.id}/components`) : [];
      const diff = diffProjectComponents(current, plan.items);
      for (const item of diff.create) {
        log(`спецификация + ${item.internalArticle} × ${fmtQty(item.quantity)} ${item.unit} (${item.status})`);
        totals.added++;
        if (args.apply) {
          await api.post(`/api/projects/${project.id}/components`, {
            componentId: catalogByKey.get(item.key).id,
            quantity: item.quantity,
            status: item.status,
            comment: item.projectComment,
          });
        }
      }
      for (const { item, row, patch } of diff.update) {
        const parts = [];
        if (patch.quantity != null) parts.push(`кол-во ${fmtQty(row.quantity)} → ${fmtQty(patch.quantity)}`);
        if (patch.status) parts.push(`статус ${row.status} → ${patch.status}`);
        if (patch.comment) parts.push("комментарий");
        log(`спецификация ~ ${item.internalArticle}: ${parts.join(", ")}`);
        totals.updated++;
        if (args.apply) await api.patch(`/api/projects/${project.id}/components/${row.id}`, patch);
      }
      for (const row of diff.extra) {
        const fromDrawing = row.comment?.startsWith(`Чертёж №${plan.drawingNo}:`);
        if (args.prune && fromDrawing) {
          log(`спецификация − ${row.component.internalArticle} (больше нет в BOM чертежа)`);
          totals.removed++;
          if (args.apply) await api.del(`/api/projects/${project.id}/components/${row.id}`);
        } else {
          log(`· ${row.component.internalArticle} есть в проекте, но не в BOM чертежа — оставлено${fromDrawing ? " (удалить: --prune)" : ""}`);
          totals.extra++;
        }
      }
      if (diff.unchanged.length) log(`без изменений: ${diff.unchanged.length} поз.`);
      if (plan.skippedRows.length) log(`⚠ пропущены строки BOM без количества: ${plan.skippedRows.join("; ")}`);
      // 4. чертёж целиком: листы, разъёмы, распиновка, замечания (вкладка «Электросхемы»)
      const d = plan.drawing;
      const what = `разъёмов ${d.connectors.length}, пинов ${d.pins.length}, замечаний ${d.notes.length}, листов ${d.sheets.length}`;
      let dStatus = "created";
      if (project?.id) {
        const q = args.apply ? "" : "?dryRun=1";
        dStatus = (await api.request("PUT", `/api/projects/${project.id}/drawings/${plan.drawingNo}${q}`, d)).status;
      }
      const label = { created: "загрузить", updated: "обновить", moved: "перенести в этот проект", unchanged: "без изменений" }[dStatus];
      log(`чертёж №${plan.drawingNo}: ${label} (${what})`);
      if (dStatus !== "unchanged") totals.drawings++;
    } catch (e) {
      totals.errors++;
      r.errors.push(e.message);
      console.error(`    ✖ ошибка: ${e.message}`);
    }
  }

  if (!args.noPrices && !args.drawings.length) await runPriceStage(api, args, config, report, totals);

  report.totals = totals;
  console.log(
    `\nИтого${args.apply ? "" : " (план)"}: проектов создано ${totals.projectsCreated}, ` +
      `каталог +${totals.catalogCreated} / дополнено ${totals.catalogFilled}, ` +
      `позиций спецификации +${totals.added} / изменено ${totals.updated} / удалено ${totals.removed} / лишних ${totals.extra}, ` +
      `чертежей загружено/обновлено ${totals.drawings}, ` +
      `свод цен: поставщиков +${totals.suppliersCreated}, кроссировок +${totals.offersCreated}, ` +
      `цен обновлено ${totals.pricesUpdated}, ошибок ${totals.errors}`,
  );
  if (!args.apply) console.log("Ничего не записано. Для применения: node agent.js --apply");
  if (args.reportPath) {
    fs.writeFileSync(args.reportPath, JSON.stringify(report, null, 2));
    console.log(`Отчёт: ${args.reportPath}`);
  }
  if (totals.errors) process.exitCode = 1;
}

/**
 * Этап «Свод цен»: поставщики → каталог → кроссировки с ценами → позиции
 * спецификаций согласованных проектов. Повторный запуск на том же файле
 * ничего не меняет: цена добавляется, только если отличается от текущей.
 */
async function runPriceStage(api, args, config, report, totals) {
  if (!fs.existsSync(config.pricesFile)) {
    console.log(`\nСвод цен: файл не найден (${config.pricesFile}) — этап пропущен`);
    return;
  }
  const data = JSON.parse(fs.readFileSync(config.pricesFile, "utf8"));
  console.log(`\nСвод цен: ${config.pricesFile} (от ${data.generatedAt}, цены в ${data.currency})`);
  report.prices = [];
  const section = (title, project) => {
    const r = { key: title, title, actions: [], errors: [], project };
    report.prices.push(r);
    console.log(`\n${title}`);
    return r;
  };
  const logTo = (r) => (s) => {
    r.actions.push(s);
    console.log(`    ${s}`);
  };

  const [projects, drawings, categories, suppliers, xrefs] = await Promise.all([
    api.get("/api/projects"),
    api.get("/api/drawings"),
    api.get("/api/categories"),
    api.get("/api/suppliers"),
    api.get("/api/cross-references"),
  ]);
  const catalog = await api.get("/api/components");
  const planned = new Set(); // ключи сущностей, уже учтённых в плане (режим отчёта)
  let fakeId = 0;
  const fake = (prefix) => `planned:${prefix}:${++fakeId}`;

  // 1. поставщики
  const gen = section("Поставщики и цены");
  const log = logTo(gen);
  const supplierIds = new Map();
  for (const name of data.suppliers) {
    let s = supplierByName(suppliers, name);
    if (!s) {
      const code = nextSupplierCode(suppliers);
      log(`поставщик + ${name} [${code}], Китай, CNY`);
      totals.suppliersCreated++;
      s = args.apply
        ? await api.post("/api/suppliers", { code, name, country: "Китай", defaultCurrency: "CNY", comment: "Из свода цен поставщиков разъёмов" })
        : { id: fake("supplier"), code, name };
      suppliers.push(s);
    }
    supplierIds.set(name, s.id);
  }

  // 2. каталог: OEM из свода, которых нет среди позиций чертежей
  let housingCat = categories.find((c) => c.name.toLowerCase() === "корпуса разъёмов")?.id ?? null;
  const componentsFor = async (oem, side) => {
    let hit = matchCatalog(catalog, oem);
    if (hit.length) return hit;
    log(`каталог + ${oem} — разъём (${side}) из свода цен`);
    totals.catalogCreated++;
    if (!args.apply) {
      const c = { id: fake("component"), internalArticle: oem };
      catalog.push(c);
      return [c];
    }
    if (!housingCat) housingCat = (await api.post("/api/categories", { name: "Корпуса разъёмов" })).id;
    const c = await api.post("/api/components", {
      internalArticle: oem,
      name: `Разъём ${oem} (${side})`,
      categoryId: housingCat,
      description: "OEM-номер из свода цен поставщиков",
      comment: "Создано этапом «Свод цен»: в чертежах этого номера нет",
    });
    catalog.push(c);
    return [c];
  };

  // 3. кроссировки и цены
  const offerIds = new Map(); // `${oemKey}|${supplier}|${article}` -> [xrefId по каждому компоненту]
  for (const offer of data.offers) {
    try {
      const comps = await componentsFor(offer.oem, offer.side);
      const article = offerArticle(offer);
      const supplierId = supplierIds.get(offer.supplier);
      const ids = [];
      for (const comp of comps) {
        const existing = xrefs.find(
          (x) => x.supplier.id === supplierId && x.component.id === comp.id && normalizeArticle(x.supplierArticle) === normalizeArticle(article),
        );
        const what = `${offer.supplier}: ${article} → ${comp.internalArticle}, ${offer.price} CNY${offer.moq ? `, MOQ ${offer.moq}` : ""}`;
        if (!existing) {
          log(`кроссировка + ${what}${offer.article ? "" : " (артикул поставщика не указан — записан OEM)"}`);
          totals.offersCreated++;
          let x = { id: fake("xref") };
          if (args.apply) {
            x = await api.post("/api/cross-references", {
              supplierId,
              componentId: comp.id,
              supplierArticle: article,
              price: offer.price,
              currency: "CNY",
              minimumOrderQuantity: offer.moq ?? null,
            });
          }
          xrefs.push({ id: x.id, supplier: { id: supplierId }, component: { id: comp.id }, supplierArticle: article, currentPrice: { price: offer.price, currency: "CNY", minimumOrderQuantity: offer.moq ?? null } });
          ids.push(x.id);
        } else {
          if (!samePrice(existing.currentPrice, offer)) {
            log(`цена ~ ${what} (было ${existing.currentPrice ? `${existing.currentPrice.price} ${existing.currentPrice.currency}` : "—"})`);
            totals.pricesUpdated++;
            if (args.apply) {
              await api.post(`/api/cross-references/${existing.id}/price`, { price: offer.price, currency: "CNY", minimumOrderQuantity: offer.moq ?? null });
            }
            existing.currentPrice = { price: offer.price, currency: "CNY", minimumOrderQuantity: offer.moq ?? null };
          }
          ids.push(existing.id);
        }
      }
      const key = `${oemKey(offer.oem)}|${offer.supplier}|${offer.article ?? ""}`;
      offerIds.set(key, comps.map((c, i) => ({ componentId: c.id, xrefId: ids[i] })));
    } catch (e) {
      totals.errors++;
      gen.errors.push(`${offer.oem} / ${offer.supplier}: ${e.message}`);
      console.error(`    ✖ ${offer.oem} / ${offer.supplier}: ${e.message}`);
    }
  }
  if (!gen.actions.length) log("без изменений");

  // 4. согласованные проекты: спецификация, основное предложение, плановая цена
  const touched = new Map(); // projectId -> Set(componentId), если несколько строк плана ведут в один проект
  for (const entry of data.projects) {
    const title = `${entry.brand} ${entry.model}${entry.gen ? ` ${entry.gen}` : ""}`;
    const r = section(`${title} — ${entry.ready}`);
    const plog = logTo(r);
    try {
      const m = matchPriceProject(projects, drawings, entry, config.priceProjectMap);
      let project = m.project;
      if (m.by === "map" && !project) throw new Error(`в priceProjectMap указан проект "${m.mappedTo}", но его нет в системе`);
      if (m.by === "drawing-pending") {
        plog(`проект будет создан из чертежа №${m.drawingNo} — цены подставятся при следующем запуске`);
        continue;
      }
      if (project) {
        const how = { map: "привязка из project-map.json", drawing: `по чертежу №${m.drawingNo}`, article: "по артикулу", name: "по названию" }[m.by];
        plog(`проект (${how}): ${project.name} [${project.article ?? project.id}]`);
      } else {
        plog(`создать проект: ${m.planned.name} [${m.planned.article}]`);
        totals.projectsCreated++;
        project = args.apply
          ? await api.post("/api/projects", { name: m.planned.name, article: m.planned.article, responsible: config.responsible })
          : { id: fake("project"), name: m.planned.name, article: m.planned.article };
        projects.push(project);
      }
      r.project = { id: project.id, name: project.name, article: project.article };
      if (entry.kitRub != null) {
        plog(
          `разъёмы на комплект (разъём + пины + допы): ${entry.kitCny} CNY ≈ ${entry.kitRub} ₽ (курс ${data.rate} × ${data.coef})` +
            (entry.fileKitRub != null && Math.abs(entry.fileKitRub - entry.kitRub) > 0.5 ? `; в своде — ${entry.fileKitRub} ₽` : ""),
        )
      }
      if (entry.sales?.qty) plog(`продажи Ozon: ${entry.sales.qty} шт на ${entry.sales.sum} ₽, ср. цена ${Math.round(entry.sales.avg)} ₽`);
      if (entry.missing) plog(`⚠ ${entry.missing}`);
      if (entry.note) plog(`примечание: ${entry.note}`);

      const isReal = !String(project.id).startsWith("planned:");
      const current = isReal ? await api.get(`/api/projects/${project.id}/components`) : [];
      const done = touched.get(project.id) ?? new Set();
      touched.set(project.id, done);
      for (const line of uniqueLines(entry.lines)) {
        const comps = matchCatalog(catalog, line.oem);
        const offers = line.best ? offerIds.get(`${oemKey(line.oem)}|${line.best.supplier}|${line.best.article ?? ""}`) ?? [] : [];
        for (const comp of comps) {
          if (done.has(comp.id)) continue;
          done.add(comp.id);
          const xrefId = offers.find((o) => o.componentId === comp.id)?.xrefId ?? null;
          const row = current.find((c) => c.componentId === comp.id || c.component?.id === comp.id);
          if (!row) {
            const status = lineStatus(line);
            plog(`спецификация + ${comp.internalArticle} × ${line.qty} (${status})${line.main ? "" : " — альтернативный вариант"}${line.best ? `, ${line.best.supplier} ${line.best.price} CNY` : ", без цены"}`);
            totals.added++;
            if (args.apply && isReal) {
              const pc = await api.post(`/api/projects/${project.id}/components`, {
                componentId: comp.id,
                quantity: line.qty,
                status,
                comment: lineComment(line),
                plannedPrice: line.best?.price ?? null,
                plannedCurrency: line.best ? "CNY" : null,
              });
              if (xrefId && !String(xrefId).startsWith("planned:")) {
                await api.patch(`/api/projects/${project.id}/components/${pc.id}`, { primaryOfferId: xrefId });
              }
            }
            continue;
          }
          const patch = diffProjectLine(row, line, xrefId && !String(xrefId).startsWith("planned:") ? xrefId : null);
          if (Object.keys(patch).length) {
            const parts = [];
            if (patch.primaryOfferId) parts.push(`основное предложение ${line.best.supplier}`);
            if (patch.plannedPrice != null) parts.push(`плановая цена ${patch.plannedPrice} CNY`);
            if (patch.comment) parts.push("комментарий");
            plog(`спецификация ~ ${comp.internalArticle}: ${parts.join(", ")}`);
            totals.updated++;
            if (args.apply) await api.patch(`/api/projects/${project.id}/components/${row.id}`, patch);
          }
        }
      }
      // Пины разъёмов из свода: их цена уже в цене разъёма → плановая цена 0, чтобы стоимость не была «частичной»
      if (isReal) {
        const priced = new Set();
        for (const line of entry.lines) {
          if (!line.main || !line.best) continue;
          for (const comp of matchCatalog(catalog, line.oem)) priced.add(oemKey(comp.internalArticle));
          priced.add(oemKey(line.oem));
        }
        const projectDrawings = await api.get(`/api/projects/${project.id}/drawings`);
        const covered = coveredContacts(projectDrawings.flatMap((d) => d.connectors ?? []), priced);
        for (const row of current) {
          const housings = covered.get(oemKey(row.component?.internalArticle));
          if (!housings || row.primaryOfferId || row.status === "not_required" || done.has(`pin:${row.id}`)) continue;
          done.add(`pin:${row.id}`);
          const patch = {};
          if (row.plannedPrice == null) Object.assign(patch, { plannedPrice: 0, plannedCurrency: "CNY" });
          const comment = INCLUDED_COMMENT(housings);
          if ((!row.comment || row.comment.startsWith(PRICE_COMMENT_PREFIX) || row.comment.startsWith("Чертёж №")) && !row.comment?.includes(comment)) {
            patch.comment = row.comment && !row.comment.startsWith(PRICE_COMMENT_PREFIX) ? `${row.comment} | ${comment}` : comment;
          }
          if (!Object.keys(patch).length) continue;
          plog(`спецификация ~ ${row.component.internalArticle}: входит в цену разъёма ${housings.join(", ")} → плановая цена 0`);
          totals.updated++;
          if (args.apply) await api.patch(`/api/projects/${project.id}/components/${row.id}`, patch);
        }
      }
      if (r.actions.every((a) => !a.startsWith("спецификация"))) plog("спецификация: без изменений");
    } catch (e) {
      totals.errors++;
      r.errors.push(e.message);
      console.error(`    ✖ ошибка: ${e.message}`);
    }
  }
}

main().catch((e) => {
  console.error("Критическая ошибка агента:", e.message);
  process.exit(1);
});
