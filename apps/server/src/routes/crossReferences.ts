import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { recordPrice } from "../pricing.js";

export const crossReferencesRouter = Router();

// GET /api/cross-references — общая таблица "Все кроссировки".
// Фильтрация/сортировка — на клиенте (как и в главной таблице проектов):
// датасет для фазы 1-2 некрупный, это даёт одинаковые Excel-подобные
// фильтры без дублирования логики на сервере.
crossReferencesRouter.get("/", async (_req, res) => {
  const rows = await prisma.supplierCrossReference.findMany({
    include: {
      supplier: true,
      component: true,
      prices: { orderBy: { effectiveAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  });

  const componentIds = Array.from(new Set(rows.map((r) => r.componentId)));
  const projectLinks = componentIds.length
    ? await prisma.projectComponent.findMany({
        where: { componentId: { in: componentIds } },
        select: { componentId: true, project: { select: { id: true, name: true } } },
      })
    : [];
  const projectsByComponent = new Map<string, { id: string; name: string }[]>();
  for (const link of projectLinks) {
    const list = projectsByComponent.get(link.componentId) ?? [];
    list.push(link.project);
    projectsByComponent.set(link.componentId, list);
  }

  res.json(
    rows.map((r) => ({
      id: r.id,
      supplier: { id: r.supplier.id, code: r.supplier.code, name: r.supplier.name },
      component: { id: r.component.id, internalArticle: r.component.internalArticle, name: r.component.name },
      supplierArticle: r.supplierArticle,
      status: r.status,
      isPrimary: r.isPrimary,
      source: r.source,
      currentPrice: r.prices[0]
        ? {
            price: r.prices[0].price,
            currency: r.prices[0].currency,
            availability: r.prices[0].availability,
            minimumOrderQuantity: r.prices[0].minimumOrderQuantity,
            leadTimeDays: r.prices[0].leadTimeDays,
            effectiveAt: r.prices[0].effectiveAt,
          }
        : null,
      projects: projectsByComponent.get(r.componentId) ?? [],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  );
});

const createSchema = z.object({
  supplierId: z.string().min(1),
  componentId: z.string().min(1),
  supplierArticle: z.string().trim().min(1),
  status: z.enum(["active", "discontinued"]).default("active"),
  price: z.coerce.number().nonnegative().optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  minimumOrderQuantity: z.coerce.number().int().positive().nullable().optional(),
  availability: z.enum(["yes", "no", "on_order"]).nullable().optional(),
  leadTimeDays: z.coerce.number().int().nonnegative().nullable().optional(),
});

crossReferencesRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Некорректные данные", details: parsed.error.flatten() });
  const data = parsed.data;

  try {
    const xref = await prisma.supplierCrossReference.create({
      data: {
        supplierId: data.supplierId,
        componentId: data.componentId,
        supplierArticle: data.supplierArticle,
        status: data.status,
        source: "manual",
      },
    });
    if (data.price != null && data.currency) {
      await recordPrice(xref.id, {
        price: data.price,
        currency: data.currency,
        minimumOrderQuantity: data.minimumOrderQuantity ?? null,
        availability: data.availability ?? null,
        leadTimeDays: data.leadTimeDays ?? null,
      });
    }
    const full = await prisma.supplierCrossReference.findUnique({
      where: { id: xref.id },
      include: { supplier: true, component: true, prices: { orderBy: { effectiveAt: "desc" }, take: 1 } },
    });
    res.status(201).json(full);
  } catch (e: any) {
    if (e.code === "P2002") return res.status(409).json({ error: "Такая кроссировка уже существует" });
    throw e;
  }
});

const updateSchema = z.object({
  supplierArticle: z.string().trim().min(1).optional(),
  status: z.enum(["active", "discontinued"]).optional(),
});

crossReferencesRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Некорректные данные", details: parsed.error.flatten() });
  try {
    const updated = await prisma.supplierCrossReference.update({ where: { id: req.params.id }, data: parsed.data });
    res.json(updated);
  } catch (e: any) {
    if (e.code === "P2025") return res.status(404).json({ error: "Кроссировка не найдена" });
    throw e;
  }
});

const priceSchema = z.object({
  price: z.coerce.number().nonnegative(),
  currency: z.string().trim().min(1).max(10),
  minimumOrderQuantity: z.coerce.number().int().positive().nullable().optional(),
  availability: z.enum(["yes", "no", "on_order"]).nullable().optional(),
  leadTimeDays: z.coerce.number().int().nonnegative().nullable().optional(),
});

// POST /api/cross-references/:id/price — ручное добавление/обновление
// цены. Не перезаписывает существующую запись — добавляет новую
// (append-only), как и импорт, так что история не теряется.
crossReferencesRouter.post("/:id/price", async (req, res) => {
  const parsed = priceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Некорректные данные", details: parsed.error.flatten() });

  const xref = await prisma.supplierCrossReference.findUnique({ where: { id: req.params.id } });
  if (!xref) return res.status(404).json({ error: "Кроссировка не найдена" });

  const { price, changed } = await recordPrice(req.params.id, parsed.data);
  res.status(201).json({ price, changed });
});

crossReferencesRouter.get("/:id/price-history", async (req, res) => {
  const xref = await prisma.supplierCrossReference.findUnique({ where: { id: req.params.id } });
  if (!xref) return res.status(404).json({ error: "Кроссировка не найдена" });
  const history = await prisma.supplierPriceHistory.findMany({
    where: { crossReferenceId: req.params.id },
    orderBy: { changedAt: "desc" },
  });
  res.json(history);
});

crossReferencesRouter.delete("/:id", async (req, res) => {
  const usedAsPrimary = await prisma.projectComponent.findFirst({ where: { primaryOfferId: req.params.id } });
  if (usedAsPrimary) {
    return res.status(409).json({
      error: "Кроссировка выбрана как основное предложение в спецификации проекта — сначала снимите выбор там",
    });
  }
  try {
    await prisma.supplierCrossReference.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e: any) {
    if (e.code === "P2025") return res.status(404).json({ error: "Кроссировка не найдена" });
    throw e;
  }
});
