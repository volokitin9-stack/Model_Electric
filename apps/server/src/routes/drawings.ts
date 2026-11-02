import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../db.js";

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
      data: data.connectors.map((c, i) => ({ ...c, drawingId: d.id, sortOrder: i })),
    });
    await tx.drawingPin.createMany({
      data: data.pins.map((p, i) => ({ ...p, drawingId: d.id, sortOrder: i })),
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
