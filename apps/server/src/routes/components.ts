import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { normalizeArticle } from "../normalize.js";

export const componentsRouter = Router();
export const categoriesRouter = Router();

categoriesRouter.get("/", async (_req, res) => {
  const categories = await prisma.componentCategory.findMany({ orderBy: { name: "asc" } });
  res.json(categories);
});

categoriesRouter.post("/", async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(100) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Некорректные данные" });
  try {
    const category = await prisma.componentCategory.create({ data: parsed.data });
    res.status(201).json(category);
  } catch {
    res.status(409).json({ error: "Категория с таким названием уже есть" });
  }
});

const componentCreateSchema = z.object({
  internalArticle: z.string().trim().min(1, "Артикул обязателен").max(100),
  name: z.string().trim().min(1, "Наименование обязательно").max(300),
  categoryId: z.string().nullable().optional(),
  unit: z.string().trim().min(1).max(20).default("шт"),
  imagePath: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
});
const componentUpdateSchema = componentCreateSchema.partial();

componentsRouter.get("/", async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const categoryId = typeof req.query.categoryId === "string" ? req.query.categoryId : undefined;

  const components = await prisma.componentCatalog.findMany({
    where: {
      categoryId: categoryId || undefined,
      ...(search
        ? {
            OR: [
              { internalArticle: { contains: search } },
              { name: { contains: search } },
            ],
          }
        : {}),
    },
    include: {
      category: true,
      _count: { select: { crossReferences: true, projectComponents: true } },
    },
    orderBy: { internalArticle: "asc" },
    take: 500,
  });
  res.json(components);
});

componentsRouter.get("/:id", async (req, res) => {
  const component = await prisma.componentCatalog.findUnique({
    where: { id: req.params.id },
    include: {
      category: true,
      crossReferences: { include: { supplier: true }, orderBy: { updatedAt: "desc" } },
      projectComponents: { include: { project: { select: { id: true, name: true } } } },
    },
  });
  if (!component) return res.status(404).json({ error: "Комплектующее не найдено" });
  res.json(component);
});

componentsRouter.post("/", async (req, res) => {
  const parsed = componentCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Некорректные данные", details: parsed.error.flatten() });

  const normalized = normalizeArticle(parsed.data.internalArticle);
  const existing = await prisma.componentCatalog.findMany({ select: { id: true, internalArticle: true } });
  const collision = existing.find((c) => normalizeArticle(c.internalArticle) === normalized);
  if (collision) {
    return res.status(409).json({
      error: "Похожий артикул уже есть в каталоге",
      existing: collision,
    });
  }

  const component = await prisma.componentCatalog.create({ data: parsed.data });
  res.status(201).json(component);
});

componentsRouter.patch("/:id", async (req, res) => {
  const parsed = componentUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Некорректные данные", details: parsed.error.flatten() });

  if (parsed.data.internalArticle) {
    const normalized = normalizeArticle(parsed.data.internalArticle);
    const existing = await prisma.componentCatalog.findMany({
      where: { id: { not: req.params.id } },
      select: { id: true, internalArticle: true },
    });
    const collision = existing.find((c) => normalizeArticle(c.internalArticle) === normalized);
    if (collision) {
      return res.status(409).json({ error: "Похожий артикул уже есть в каталоге", existing: collision });
    }
  }

  try {
    const component = await prisma.componentCatalog.update({ where: { id: req.params.id }, data: parsed.data });
    res.json(component);
  } catch {
    res.status(404).json({ error: "Комплектующее не найдено" });
  }
});
