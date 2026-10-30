import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { diffProjectChanges } from "../changelog.js";
import {
  OVERALL_STATUSES,
  PROCESS_CONFIG,
  PROCESS_FIELDS,
  computeNextAction,
  computeProgress,
} from "../statuses.js";

export const projectsRouter = Router();

const baseShape = {
  name: z.string().trim().min(1, "Название обязательно").max(200),
  article: z.string().trim().max(100).nullable().optional(),
  responsible: z.string().trim().max(120).nullable().optional(),
  overallStatus: z.enum(OVERALL_STATUSES).optional(),
  plannedDate: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .nullable()
    .optional(),
};

// Разрешённые значения каждого процесса проверяются динамически
// (PROCESS_CONFIG) — единственный источник правды со statuses.ts.
function processFieldSchema(field: (typeof PROCESS_FIELDS)[number]) {
  return z
    .string()
    .refine((v) => (PROCESS_CONFIG[field].options as readonly string[]).includes(v), {
      message: `Недопустимое значение для ${field}`,
    })
    .optional();
}

const processShape = Object.fromEntries(
  PROCESS_FIELDS.map((f) => [f, processFieldSchema(f)]),
) as Record<(typeof PROCESS_FIELDS)[number], ReturnType<typeof processFieldSchema>>;

const createSchema = z.object({ ...baseShape, ...processShape });
const updateSchema = z.object({ ...baseShape, ...processShape }).partial();

function serialize(project: Record<string, any>) {
  return {
    ...project,
    progress: computeProgress(project as any),
    nextAction: computeNextAction(project as any),
  };
}

// GET /api/projects — полный список (фильтрация/сортировка на клиенте
// через TanStack Table; датасет небольшой, и это даёт консистентные
// Excel-подобные фильтры без дублирования логики на сервере).
projectsRouter.get("/", async (_req, res) => {
  const projects = await prisma.project.findMany({ orderBy: { updatedAt: "desc" } });
  res.json(projects.map(serialize));
});

projectsRouter.get("/:id", async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (!project) return res.status(404).json({ error: "Проект не найден" });
  res.json(serialize(project));
});

projectsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Некорректные данные", details: parsed.error.flatten() });
  }
  const data = parsed.data;
  const project = await prisma.project.create({
    data: {
      name: data.name,
      article: data.article ?? null,
      responsible: data.responsible ?? null,
      overallStatus: data.overallStatus ?? "active",
      plannedDate: data.plannedDate ? new Date(data.plannedDate) : null,
      searchConnectors: data.searchConnectors ?? "not_started",
      schemeDevelopment: data.schemeDevelopment ?? "not_started",
      orderConnectors: data.orderConnectors ?? "not_started",
      payment: data.payment ?? "not_started",
      supplyConnectors: data.supplyConnectors ?? "not_started",
      orderTooling: data.orderTooling ?? "not_started",
      supplyTooling: data.supplyTooling ?? "not_started",
    },
  });

  await prisma.changeLogEntry.create({
    data: {
      projectId: project.id,
      field: "project",
      fieldLabel: "Проект создан",
      oldValue: null,
      newValue: project.name,
    },
  });

  res.status(201).json(serialize(project));
});

projectsRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Некорректные данные", details: parsed.error.flatten() });
  }

  const existing = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Проект не найден" });

  const data = parsed.data;
  const updatePayload: Record<string, unknown> = { ...data };
  const diffInput: Record<string, unknown> = { ...data };
  if ("plannedDate" in data) {
    const normalized = data.plannedDate ? new Date(data.plannedDate) : null;
    updatePayload.plannedDate = normalized;
    diffInput.plannedDate = normalized;
  }

  const changeEntries = diffProjectChanges(existing as unknown as Record<string, unknown>, diffInput);

  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: updatePayload,
  });

  if (changeEntries.length > 0) {
    await prisma.changeLogEntry.createMany({
      data: changeEntries.map((e) => ({ ...e, projectId: project.id })),
    });
  }

  res.json(serialize(project));
});

projectsRouter.get("/:id/changelog", async (req, res) => {
  const exists = await prisma.project.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!exists) return res.status(404).json({ error: "Проект не найден" });

  const entries = await prisma.changeLogEntry.findMany({
    where: { projectId: req.params.id },
    orderBy: { changedAt: "desc" },
  });
  res.json(entries);
});
