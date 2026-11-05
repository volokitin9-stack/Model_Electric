import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../db.js";
import { normalizeArticle } from "../normalize.js";

// Чертежи жгутов: разъёмы, распиновка, замечания (вкладка «Электросхемы»).
// Загружаются агентом apps/spec-import-agent, см. его README.

export const drawingsRouter = Router();
export const projectDrawingsRouter = Router({ mergeParams: true });

const str = z.union([z.string(), z.number()]).transform((v) => String(v).trim()).nullable().optional();

const drawingSchema = z.object({
  brand: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(200),
  sourceFile: z.string().max(500).nullable().optional(),
  sheets: z.array(z.object({ sheet: z.string(), description: z.string().nullable().optional() })).max(100),
  connectors: z
    .array(
      z.object({
        sheet: z.string(),
        designator: z.string().min(1),
        bomPosition: str,
        purpose: str,
        housingPn: str,
        manufacturer: str,
        positions: str,
        contactPn: str,
        contactQty: str,
        status: str,
        note: str,
      }),
    )
    .max(2000),
  pins: z
    .array(
      z.object({
        sheet: z.string(),
        connector: z.string().min(1),
        housingPn: str,
        contactPn: str,
        pin: str,
        wire: str,
        color: str,
        crossSection: str,
        destination: str,
        doubleCrimp: z.boolean().default(false),
        crossSectionCheck: str,
        note: str,
      }),
    )
    .max(10000),
  notes: z
    .array(
      z.object({
        number: z.number().int(),
        topic: str,
        text: z.string().min(1),
        recommendation: str,
      }),
    )
    .max(2000),
});

type DrawingInput = z.infer<typeof drawingSchema>;

function hashOf(data: DrawingInput): string {
  return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

const withChildren = {
  connectors: { orderBy: { sortOrder: "asc" as const } },
  pins: { orderBy: { sortOrder: "asc" as const } },
  notes: { orderBy: { number: "asc" as const } },
};

function serialize(d: any) {
  const { sheetsJson, ...rest } = d;
  return { ...rest, sheets: JSON.parse(sheetsJson) };
}

// GET /api/drawings — короткий список всех чертежей и их проектов.
drawingsRouter.get("/", async (_req, res) => {
  const drawings = await prisma.projectDrawing.findMany({
    select: {
      id: true,
      drawingNo: true,
      brand: true,
      model: true,
      projectId: true,
      contentHash: true,
      updatedAt: true,
      project: { select: { name: true, article: true } },
      _count: { select: { connectors: true, pins: true, notes: true } },
    },
    orderBy: { drawingNo: "asc" },
  });
  res.json(drawings);
});

// GET /api/drawings/search?article=... — "откуда этот разъём/пин": по
// артикулу (housingPn разъёма или contactPn пина, нормализованному так
// же, как каталог комплектующих) находит все чертежи/модели, где он
// встречается, без необходимости искать по каждой модели отдельно.
drawingsRouter.get("/search", async (req, res) => {
  const q = String(req.query.article ?? "").trim();
  if (!q) return res.status(400).json({ error: "Укажите артикул для поиска" });
  const nq = normalizeArticle(q);

  const [component, connectors, pins] = await Promise.all([
    prisma.componentCatalog.findMany({
      where: { internalArticle: { contains: q, mode: "insensitive" } },
      include: { category: true },
      take: 20,
    }),
    prisma.drawingConnector.findMany({
      where: { housingPn: { not: null } },
      include: { drawing: { include: { project: { select: { id: true, name: true, article: true } } } } },
    }),
    prisma.drawingPin.findMany({
      where: { contactPn: { not: null } },
      include: { drawing: { include: { project: { select: { id: true, name: true, article: true } } } } },
    }),
  ]);

  const matchedComponent = component.find((c) => normalizeArticle(c.internalArticle) === nq) ?? component[0] ?? null;
  const matchedConnectors = connectors.filter((c) => c.housingPn && normalizeArticle(c.housingPn).includes(nq));
  const matchedPins = pins.filter((p) => p.contactPn && normalizeArticle(p.contactPn).includes(nq));

  type Group = {
    projectId: string;
    projectName: string;
    projectArticle: string | null;
    drawingNo: number;
    brand: string;
    model: string;
    connectors: Array<{ sheet: string; designator: string; housingPn: string | null; manufacturer: string | null; positions: string | null }>;
    pins: Array<{ sheet: string; connector: string; contactPn: string | null; pin: string | null; wire: string | null; color: string | null }>;
  };
  const groups = new Map<string, Group>();
  const groupFor = (drawing: (typeof connectors)[number]["drawing"]) => {
    const key = drawing.id;
    let g = groups.get(key);
    if (!g) {
      g = {
        projectId: drawing.project.id,
        projectName: drawing.project.name,
        projectArticle: drawing.project.article,
        drawingNo: drawing.drawingNo,
        brand: drawing.brand,
        model: drawing.model,
        connectors: [],
        pins: [],
      };
      groups.set(key, g);
    }
    return g;
  };
  for (const c of matchedConnectors) {
    groupFor(c.drawing).connectors.push({ sheet: c.sheet, designator: c.designator, housingPn: c.housingPn, manufacturer: c.manufacturer, positions: c.positions });
  }
  for (const p of matchedPins) {
    groupFor(p.drawing).pins.push({ sheet: p.sheet, connector: p.connector, contactPn: p.contactPn, pin: p.pin, wire: p.wire, color: p.color });
  }

  res.json({
    query: q,
    component: matchedComponent,
    componentMatches: component,
    results: Array.from(groups.values()).sort((a, b) => a.drawingNo - b.drawingNo),
  });
});

// Пересчитать componentId у всех разъёмов/пинов по текущему каталогу
// комплектующих. componentId не входит в contentHash чертежа, поэтому
// повторная загрузка неизменившегося чертежа его не обновит — нужен
// отдельный пересчёт: вызывается и по запросу (ручка ниже), и сама
// после каждого прогона кнопки "Обновить данные" (см. src/specImport.ts) —
// каталог мог пополниться новыми артикулами уже в этом же прогоне
// (этап «Свод цен» идёт после загрузки чертежей).
export async function relinkDrawingsToCatalog() {
  const catalog = await prisma.componentCatalog.findMany({ select: { id: true, internalArticle: true } });
  const byArticle = new Map(catalog.map((c) => [normalizeArticle(c.internalArticle), c.id]));

  const [connectors, pins] = await Promise.all([
    prisma.drawingConnector.findMany({ select: { id: true, housingPn: true, componentId: true } }),
    prisma.drawingPin.findMany({ select: { id: true, contactPn: true, componentId: true } }),
  ]);

  let connectorsLinked = 0;
  let pinsLinked = 0;
  await prisma.$transaction([
    ...connectors
      .map((c) => ({ c, next: c.housingPn ? (byArticle.get(normalizeArticle(c.housingPn)) ?? null) : null }))
      .filter(({ c, next }) => next !== c.componentId)
      .map(({ c, next }) => {
        connectorsLinked++;
        return prisma.drawingConnector.update({ where: { id: c.id }, data: { componentId: next } });
      }),
    ...pins
      .map((p) => ({ p, next: p.contactPn ? (byArticle.get(normalizeArticle(p.contactPn)) ?? null) : null }))
      .filter(({ p, next }) => next !== p.componentId)
      .map(({ p, next }) => {
        pinsLinked++;
        return prisma.drawingPin.update({ where: { id: p.id }, data: { componentId: next } });
      }),
  ]);

  return { connectorsLinked, pinsLinked, connectorsTotal: connectors.length, pinsTotal: pins.length };
}

drawingsRouter.post("/relink-catalog", async (_req, res) => {
  res.json(await relinkDrawingsToCatalog());
});

// GET /api/projects/:projectId/drawings — чертежи проекта со всеми таблицами.
projectDrawingsRouter.get("/", async (req, res) => {
  const { projectId } = req.params as { projectId: string };
  const drawings = await prisma.projectDrawing.findMany({
    where: { projectId },
    include: withChildren,
    orderBy: { drawingNo: "asc" },
  });
  res.json(drawings.map(serialize));
});

// PUT /api/projects/:projectId/drawings/:drawingNo[?dryRun=1] — загрузить
// чертёж целиком. Ответ: { status: created|updated|moved|unchanged }.
projectDrawingsRouter.put("/:drawingNo", async (req, res) => {
  const { projectId, drawingNo: rawNo } = req.params as { projectId: string; drawingNo: string };
  const drawingNo = Number(rawNo);
  if (!Number.isInteger(drawingNo) || drawingNo <= 0) return res.status(400).json({ error: "Некорректный № чертежа" });

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return res.status(404).json({ error: "Проект не найден" });

  const parsed = drawingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Некорректные данные", details: parsed.error.flatten() });
  const data = parsed.data;
  const contentHash = hashOf(data);
  const dryRun = req.query.dryRun === "1" || req.query.dryRun === "true";

  const existing = await prisma.projectDrawing.findUnique({ where: { drawingNo } });
  const status = !existing
    ? "created"
    : existing.projectId !== projectId
      ? "moved"
      : existing.contentHash === contentHash
        ? "unchanged"
        : "updated";

  const counts = { connectors: data.connectors.length, pins: data.pins.length, notes: data.notes.length };
  if (dryRun || status === "unchanged") return res.json({ status, drawingNo, counts, dryRun });

  const header = {
    projectId,
    brand: data.brand,
    model: data.model,
    sourceFile: data.sourceFile ?? null,
    sheetsJson: JSON.stringify(data.sheets),
    contentHash,
    importedAt: new Date(),
  };

  // Связь с общим каталогом комплектующих по нормализованному артикулу —
  // один и тот же разъём/пин в разных чертежах указывает на одну запись
  // каталога, цену/поставщика искать заново для каждой модели не нужно
  // (см. componentId в schema.prisma). Не создаёт новых записей каталога
  // — только связывает с уже существующими, иначе эта ветка начала бы
  // тихо плодить дубли мимо проверенной логики создания каталога.
  const catalog = await prisma.componentCatalog.findMany({ select: { id: true, internalArticle: true } });
  const catalogByArticle = new Map(catalog.map((c) => [normalizeArticle(c.internalArticle), c.id]));
  const catalogIdFor = (pn: string | null | undefined) =>
    pn ? (catalogByArticle.get(normalizeArticle(pn)) ?? null) : null;

  const drawing = await prisma.$transaction(async (tx) => {
    const d = existing
      ? await tx.projectDrawing.update({ where: { id: existing.id }, data: header })
      : await tx.projectDrawing.create({ data: { ...header, drawingNo } });
    if (existing) {
      await tx.drawingConnector.deleteMany({ where: { drawingId: d.id } });
      await tx.drawingPin.deleteMany({ where: { drawingId: d.id } });
      await tx.drawingNote.deleteMany({ where: { drawingId: d.id } });
    }
    await tx.drawingConnector.createMany({
      data: data.connectors.map((c, i) => ({ ...c, drawingId: d.id, sortOrder: i, componentId: catalogIdFor(c.housingPn) })),
    });
    await tx.drawingPin.createMany({
      data: data.pins.map((p, i) => ({ ...p, drawingId: d.id, sortOrder: i, componentId: catalogIdFor(p.contactPn) })),
    });
    await tx.drawingNote.createMany({ data: data.notes.map((n) => ({ ...n, drawingId: d.id })) });

    const summary = `№${drawingNo} ${data.brand} ${data.model}: разъёмов ${counts.connectors}, пинов ${counts.pins}, замечаний ${counts.notes}`;
    await tx.changeLogEntry.create({
      data: {
        projectId,
        field: "drawing",
        fieldLabel: status === "created" ? "Чертёж загружен" : status === "moved" ? "Чертёж перенесён в проект" : "Чертёж обновлён",
        oldValue: null,
        newValue: summary,
        changedBy: "Spec Import Agent",
      },
    });
    if (status === "moved" && existing) {
      await tx.changeLogEntry.create({
        data: {
          projectId: existing.projectId,
          field: "drawing",
          fieldLabel: "Чертёж перенесён в другой проект",
          oldValue: `№${drawingNo}`,
          newValue: null,
          changedBy: "Spec Import Agent",
        },
      });
    }
    return d;
  });

  res.status(status === "created" ? 201 : 200).json({ status, drawingNo, counts, id: drawing.id });
});
