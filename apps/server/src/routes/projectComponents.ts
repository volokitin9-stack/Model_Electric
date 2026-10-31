import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { normalizeArticle } from "../normalize.js";
import { COMPONENT_STATUSES } from "../statuses.js";
import { computeSpecFillPercent, resolveComponentPrice, summarizeCost } from "../pricing.js";

export const projectComponentsRouter = Router({ mergeParams: true });

async function assertProject(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  return project;
}

async function withCost(pc: {
  id: string;
  quantity: Prisma.Decimal;
  status: string;
  primaryOfferId: string | null;
  plannedPrice: Prisma.Decimal | null;
  plannedCurrency: string | null;
}) {
  const cost = await resolveComponentPrice(pc);
  const lineTotal = cost.amount != null ? pc.quantity.times(cost.amount) : null;
  return { cost, lineTotal };
}

// GET /api/projects/:projectId/components
projectComponentsRouter.get("/", async (req, res) => {
  const { projectId } = req.params as { projectId: string };
  if (!(await assertProject(projectId))) return res.status(404).json({ error: "Проект не найден" });

  const rows = await prisma.projectComponent.findMany({
    where: { projectId },
    include: {
      component: { include: { category: true } },
      primaryOffer: { include: { supplier: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const withCosts = await Promise.all(
    rows.map(async (r) => {
      const { cost, lineTotal } = await withCost(r);
      return { ...r, cost, lineTotal: lineTotal?.toFixed(2) ?? null };
    }),
  );

  res.json(withCosts);
});

const addComponentSchema = z.object({
  componentId: z.string().optional(),
  internalArticle: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  categoryId: z.string().nullable().optional(),
  unit: z.string().trim().min(1).max(20).optional(),
  quantity: z.coerce.number().positive().default(1),
  status: z.enum(COMPONENT_STATUSES).default("not_defined"),
  comment: z.string().nullable().optional(),
  plannedPrice: z.coerce.number().nonnegative().nullable().optional(),
  plannedCurrency: z.string().nullable().optional(),
});

// POST /api/projects/:projectId/components — добавить позицию в спецификацию.
// Принимает либо componentId существующего комплектующего, либо
// internalArticle+name для переиспользования/создания в общем каталоге.
projectComponentsRouter.post("/", async (req, res) => {
  const { projectId } = req.params as { projectId: string };
  if (!(await assertProject(projectId))) return res.status(404).json({ error: "Проект не найден" });

  const parsed = addComponentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Некорректные данные", details: parsed.error.flatten() });
  const data = parsed.data;

  let componentId = data.componentId;
  if (!componentId) {
    if (!data.internalArticle || !data.name) {
      return res.status(400).json({ error: "Укажите componentId либо internalArticle и name" });
    }
    const normalized = normalizeArticle(data.internalArticle);
    const all = await prisma.componentCatalog.findMany({ select: { id: true, internalArticle: true } });
    const existing = all.find((c) => normalizeArticle(c.internalArticle) === normalized);
    if (existing) {
      componentId = existing.id; // переиспользуем — не дублируем каталог
    } else {
      const created = await prisma.componentCatalog.create({
        data: {
          internalArticle: data.internalArticle,
          name: data.name,
          categoryId: data.categoryId ?? null,
          unit: data.unit ?? "шт",
        },
      });
      componentId = created.id;
    }
  }

  try {
    const pc = await prisma.projectComponent.create({
      data: {
        projectId,
        componentId,
        quantity: new Prisma.Decimal(data.quantity),
        status: data.status,
        comment: data.comment ?? null,
        plannedPrice: data.plannedPrice != null ? new Prisma.Decimal(data.plannedPrice) : null,
        plannedCurrency: data.plannedCurrency ?? null,
      },
      include: { component: true },
    });
    res.status(201).json(pc);
  } catch (e: any) {
    if (e.code === "P2002") {
      return res.status(409).json({ error: "Это комплектующее уже есть в спецификации проекта" });
    }
    throw e;
  }
});

const updateComponentSchema = z.object({
  quantity: z.coerce.number().positive().optional(),
  status: z.enum(COMPONENT_STATUSES).optional(),
  primaryOfferId: z.string().nullable().optional(),
  plannedPrice: z.coerce.number().nonnegative().nullable().optional(),
  plannedCurrency: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
});

projectComponentsRouter.patch("/:id", async (req, res) => {
  const { projectId, id } = req.params as { projectId: string; id: string };
  const parsed = updateComponentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Некорректные данные", details: parsed.error.flatten() });

  const existing = await prisma.projectComponent.findFirst({ where: { id, projectId } });
  if (!existing) return res.status(404).json({ error: "Позиция не найдена" });

  if (parsed.data.primaryOfferId) {
    const offer = await prisma.supplierCrossReference.findUnique({ where: { id: parsed.data.primaryOfferId } });
    if (!offer || offer.componentId !== existing.componentId) {
      return res.status(400).json({ error: "Выбранное предложение не относится к этому комплектующему" });
    }
  }

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.quantity != null) data.quantity = new Prisma.Decimal(parsed.data.quantity);
  if ("plannedPrice" in parsed.data) {
    data.plannedPrice = parsed.data.plannedPrice != null ? new Prisma.Decimal(parsed.data.plannedPrice) : null;
  }

  const updated = await prisma.projectComponent.update({
    where: { id },
    data,
    include: { component: true, primaryOffer: { include: { supplier: true } } },
  });
  const { cost, lineTotal } = await withCost(updated);
  res.json({ ...updated, cost, lineTotal: lineTotal?.toFixed(2) ?? null });
});

projectComponentsRouter.delete("/:id", async (req, res) => {
  const { projectId, id } = req.params as { projectId: string; id: string };
  const existing = await prisma.projectComponent.findFirst({ where: { id, projectId } });
  if (!existing) return res.status(404).json({ error: "Позиция не найдена" });
  await prisma.projectComponent.delete({ where: { id } });
  res.status(204).end();
});

/** Собирает сводку для карточек "Обзора" проекта. Используется отдельным роутом в index.ts. */
export async function buildProjectSummary(projectId: string) {
  const rows = await prisma.projectComponent.findMany({ where: { projectId } });
  const withCosts = await Promise.all(
    rows.map(async (r) => {
      const { cost, lineTotal } = await withCost(r);
      return { id: r.id, status: r.status, componentId: r.componentId, cost, lineTotal };
    }),
  );
  const costSummary = summarizeCost(
    withCosts.map((r) => ({ id: r.id, status: r.status, cost: r.cost, lineTotal: r.lineTotal })),
  );
  const specFillPercent = computeSpecFillPercent(rows);

  const componentIds = Array.from(new Set(rows.map((r) => r.componentId)));
  const supplierCount = componentIds.length
    ? (
        await prisma.supplierCrossReference.findMany({
          where: { componentId: { in: componentIds }, status: "active" },
          distinct: ["supplierId"],
          select: { supplierId: true },
        })
      ).length
    : 0;

  const missingCount = rows.filter((r) => r.status !== "confirmed" && r.status !== "not_required").length;

  return { specFillPercent, costSummary, supplierCount, missingCount, componentCount: rows.length };
}
