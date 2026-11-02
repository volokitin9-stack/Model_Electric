/**
 * Преобразование прочитанной спецификации чертежа в то, что нужно
 * проекту «Модельной электрики»: проект, позиции общего каталога
 * комплектующих (ComponentCatalog) и строки спецификации проекта
 * (ProjectComponent). Здесь только чистые функции — без сети, чтобы
 * правила сопоставления были видны и проверялись тестами.
 */

/** Копия apps/server/src/normalize.ts — сравнение «тот же артикул, записанный иначе». */
export function normalizeArticle(raw) {
  return String(raw).trim().toUpperCase().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
}

// Статус P/N в спецификации чертежа → статус позиции спецификации проекта
// (COMPONENT_STATUSES в apps/server/src/statuses.ts).
const SPEC_STATUS_MAP = {
  "Подтверждён": "confirmed", // найден в каталоге производителя
  "Вероятно": "needs_review", // вероятный аналог — нужна сверка человеком
  "Проверить": "searching", // номер не опознан, поиск продолжается
};

export function componentStatusFromSpec(specStatus) {
  return SPEC_STATUS_MAP[specStatus] ?? "not_defined";
}

// Порядок «зрелости» статуса. Агент может только повышать статус позиции
// (например, P/N подтвердили в новой версии чертежа), но никогда не
// понижает то, что выставил человек в веб-интерфейсе. not_required —
// решение человека, агент его не трогает.
export const STATUS_RANK = {
  not_defined: 0,
  searching: 1,
  needs_review: 2,
  selected: 3,
  confirmed: 4,
};

export function upgradedStatus(current, fromSpec) {
  if (current === "not_required") return null;
  const cur = STATUS_RANK[current] ?? 0;
  const next = STATUS_RANK[fromSpec] ?? 0;
  return next > cur ? fromSpec : null;
}

export const CATEGORIES = {
  housing: "Корпуса разъёмов",
  terminal: "Контакты и наконечники",
  seal: "Уплотнители и заглушки",
  wire: "Провода и кабели",
  other: "Прочее",
};

export function categoryFor(...texts) {
  for (const raw of texts) {
    if (!raw) continue;
    const t = String(raw).toLowerCase();
    if (/^(контакт|гнездо|наконечник|клемма|ножевой|кольцев)/.test(t)) return CATEGORIES.terminal;
    if (/^(корпус|разъём|разъем|колодка)/.test(t)) return CATEGORIES.housing;
    if (/^(уплотнител|заглушк|grommet|втулк)/.test(t)) return CATEGORIES.seal;
    if (/^(кабель|провод|жгут)/.test(t)) return CATEGORIES.wire;
  }
  return CATEGORIES.other;
}

const TRANSLIT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k",
  л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
  ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/** Артикул проекта в стиле существующих (ME-LADA-VESTA-NG). */
export function projectArticle(brand, model) {
  const s = `${brand} ${model}`
    .toLowerCase()
    .split("")
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();
  return `ME-${s}`.slice(0, 100);
}

export function projectName(spec, template = "{brand} {model} — проводка ТСУ") {
  return template
    .replaceAll("{brand}", spec.brand)
    .replaceAll("{model}", spec.model)
    .replaceAll("{drawingNo}", String(spec.drawingNo));
}

const round = (n) => Math.round(n * 1000) / 1000;

function joinParts(parts) {
  const s = parts.filter(Boolean).join(" · ");
  return s || null;
}

/** Строит план переноса одного чертежа. */
export function buildDrawingPlan(spec, { nameTemplate } = {}) {
  const items = new Map(); // normalizedArticle -> item

  for (const row of spec.bom) {
    if (row.quantity == null) continue;
    // Позиции без P/N (провода, кабели) получают артикул по наименованию —
    // иначе их нельзя положить в общий каталог; это отмечено в комментарии.
    const internalArticle = (row.pn ?? row.name).slice(0, 100);
    const key = normalizeArticle(internalArticle);
    const cat = row.pn ? spec.catalog[row.pn] : undefined;
    const status = componentStatusFromSpec(cat?.status ?? row.status);
    const where = `${row.sheet}${row.position != null ? ` поз.${row.position}` : ""} — ${row.quantity} ${row.unit}`;

    const existing = items.get(key);
    if (existing) {
      existing.quantity = round(existing.quantity + row.quantity);
      existing.occurrences.push(where);
      // при расхождении статусов между листами берём менее «зрелый»
      if ((STATUS_RANK[status] ?? 0) < (STATUS_RANK[existing.status] ?? 0)) existing.status = status;
      continue;
    }

    items.set(key, {
      key,
      internalArticle,
      name: (cat?.description ?? row.name).slice(0, 300),
      unit: row.unit,
      categoryName: categoryFor(row.name, cat?.description),
      description: joinParts([
        cat?.manufacturer ?? row.manufacturer,
        cat?.series && `серия ${cat.series}`,
        cat?.crossSection && `сечение ${cat.crossSection} мм²`,
        !cat && row.name,
      ]),
      comment: joinParts([
        !row.pn && "P/N в чертеже не указан",
        cat?.status && `статус по каталогу: ${cat.status}`,
        cat?.analog,
        cat?.source,
      ]),
      quantity: round(row.quantity),
      status,
      occurrences: [where],
    });
  }

  const list = [...items.values()].map((it) => ({
    ...it,
    projectComment: `Чертёж №${spec.drawingNo}: ${it.occurrences.join("; ")}`,
  }));

  const allConfirmed = list.length > 0 && list.every((i) => i.status === "confirmed");

  return {
    drawingNo: spec.drawingNo,
    sourceFile: spec.sourceFile,
    project: {
      name: projectName(spec, nameTemplate),
      article: projectArticle(spec.brand, spec.model),
      // Только для нового проекта: спецификация по чертежу уже есть →
      // «Разработка схемы» завершена; «Поиск разъёмов» завершён, только
      // если все P/N подтверждены по каталогу. У существующих проектов
      // статусы процессов агент не трогает — их ведёт человек.
      createStatuses: {
        schemeDevelopment: "done",
        searchConnectors: allConfirmed ? "done" : "in_progress",
      },
    },
    items: list,
    skippedRows: spec.bom.filter((r) => r.quantity == null).map((r) => `${r.sheet} поз.${r.position} ${r.name}`),
    drawing: {
      brand: spec.brand,
      model: spec.model,
      sourceFile: spec.sourceFile ? spec.sourceFile.split(/[\\/]/).slice(-2).join("/") : null,
      sheets: spec.sheets,
      connectors: spec.connectors,
      pins: spec.pins,
      notes: spec.notes,
    },
  };
}

/**
 * Ищет существующий проект для чертежа: явная привязка из конфигурации
 * (projectMap: {"<№ чертежа>": "<id или артикул проекта>"}) → проект, куда
 * этот чертёж уже загружен → артикул →
 * точное название. Нечёткое совпадение не используется — вместо этого
 * в отчёт попадают «похожие» проекты, чтобы человек сам добавил привязку.
 */
export function matchProject(projects, plan, projectMap = {}, drawings = []) {
  const mapped = projectMap[String(plan.drawingNo)];
  if (mapped) {
    const p = projects.find((x) => x.id === mapped || x.article === mapped);
    return { project: p ?? null, by: "map", mappedTo: mapped, similar: [] };
  }
  const linked = drawings.find((d) => d.drawingNo === plan.drawingNo);
  const byDrawing = linked && projects.find((x) => x.id === linked.projectId);
  if (byDrawing) return { project: byDrawing, by: "drawing", similar: [] };
  const byArticle = projects.find((x) => x.article && normalizeArticle(x.article) === normalizeArticle(plan.project.article));
  if (byArticle) return { project: byArticle, by: "article", similar: [] };
  const lc = (s) => String(s ?? "").trim().toLowerCase();
  const byName = projects.find((x) => lc(x.name) === lc(plan.project.name));
  if (byName) return { project: byName, by: "name", similar: [] };

  const modelWord = lc(plan.project.name.split(" ")[1] ?? "");
  const brandWord = lc(plan.project.name.split(" ")[0] ?? "");
  const similar = modelWord
    ? projects.filter((x) => lc(x.name).includes(brandWord) && lc(x.name).includes(modelWord)).map((x) => `${x.name} (${x.article ?? x.id})`)
    : [];
  return { project: null, by: null, similar };
}

/** Сравнивает план позиций с текущей спецификацией проекта. */
export function diffProjectComponents(existingRows, items) {
  const byKey = new Map(existingRows.map((r) => [normalizeArticle(r.component.internalArticle), r]));
  const create = [];
  const update = [];
  const unchanged = [];
  for (const item of items) {
    const row = byKey.get(item.key);
    if (!row) {
      create.push(item);
      continue;
    }
    byKey.delete(item.key);
    const patch = {};
    if (Math.abs(Number(row.quantity) - item.quantity) > 1e-9) patch.quantity = item.quantity;
    const st = upgradedStatus(row.status, item.status);
    if (st) patch.status = st;
    // комментарий обновляем только если он был записан агентом
    if ((row.comment == null || row.comment.startsWith("Чертёж №")) && row.comment !== item.projectComment) {
      patch.comment = item.projectComment;
    }
    if (Object.keys(patch).length) update.push({ item, row, patch });
    else unchanged.push(item);
  }
  return { create, update, unchanged, extra: [...byKey.values()] };
}
