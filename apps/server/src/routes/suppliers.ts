import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";

export const suppliersRouter = Router();

const supplierSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(200),
  country: z.string().trim().nullable().optional(),
  contactPerson: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  email: z.string().trim().nullable().optional(),
  messenger: z.string().trim().nullable().optional(),
  website: z.string().trim().nullable().optional(),
  defaultCurrency: z.string().trim().min(1).max(10).default("RUB"),
  comment: z.string().nullable().optional(),
});

suppliersRouter.get("/", async (_req, res) => {
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
  const withStats = await Promise.all(
    suppliers.map(async (s) => {
      const [crossRefCount, pricedCount, lastBatch, lastPriceChange] = await Promise.all([
        prisma.supplierCrossReference.count({ where: { supplierId: s.id } }),
        prisma.supplierCrossReference.count({
          where: { supplierId: s.id, prices: { some: {} } },
        }),
        prisma.supplierImportBatch.findFirst({
          where: { supplierId: s.id, status: "applied" },
          orderBy: { importedAt: "desc" },
          select: { importedAt: true },
        }),
        prisma.supplierPriceHistory.findFirst({
          where: { crossReference: { supplierId: s.id } },
          orderBy: { changedAt: "desc" },
          select: { changedAt: true },
        }),
      ]);
      return {
        ...s,
        crossReferenceCount: crossRefCount,
        pricedArticleCount: pricedCount,
        lastImportAt: lastBatch?.importedAt ?? null,
        lastPriceChangeAt: lastPriceChange?.changedAt ?? null,
      };
    }),
  );
  res.json(withStats);
});

suppliersRouter.get("/:id", async (req, res) => {
  const supplier = await prisma.supplier.findUnique({ where: { id: req.params.id } });
  if (!supplier) return res.status(404).json({ error: "Поставщик не найден" });

  const crossReferences = await prisma.supplierCrossReference.findMany({
    where: { supplierId: supplier.id },
    include: { component: true, prices: { orderBy: { effectiveAt: "desc" }, take: 1 } },
    orderBy: { updatedAt: "desc" },
  });

  const importProfiles = await prisma.supplierImportProfile.findMany({ where: { supplierId: supplier.id } });
  const importBatches = await prisma.supplierImportBatch.findMany({
    where: { supplierId: supplier.id },
    orderBy: { importedAt: "desc" },
    take: 20,
  });
  const exportHistory = await prisma.supplierExportHistory.findMany({
    where: { supplierId: supplier.id },
    orderBy: { exportedAt: "desc" },
    take: 20,
  });

  const componentIds = Array.from(new Set(crossReferences.map((c) => c.componentId)));
  const projects = componentIds.length
    ? await prisma.project.findMany({
        where: { components: { some: { componentId: { in: componentIds } } } },
        select: { id: true, name: true },
      })
    : [];

  res.json({ ...supplier, crossReferences, importProfiles, importBatches, exportHistory, projects });
});

suppliersRouter.post("/", async (req, res) => {
  const parsed = supplierSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Некорректные данные", details: parsed.error.flatten() });
  try {
    const supplier = await prisma.supplier.create({ data: parsed.data });
    res.status(201).json(supplier);
  } catch (e: any) {
    if (e.code === "P2002") return res.status(409).json({ error: "Поставщик с таким кодом уже есть" });
    throw e;
  }
});

suppliersRouter.patch("/:id", async (req, res) => {
  const parsed = supplierSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Некорректные данные", details: parsed.error.flatten() });
  try {
    const supplier = await prisma.supplier.update({ where: { id: req.params.id }, data: parsed.data });
    res.json(supplier);
  } catch (e: any) {
    if (e.code === "P2002") return res.status(409).json({ error: "Поставщик с таким кодом уже есть" });
    if (e.code === "P2025") return res.status(404).json({ error: "Поставщик не найден" });
    throw e;
  }
});
