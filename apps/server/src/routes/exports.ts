import { Router } from "express";
import ExcelJS from "exceljs";
import { z } from "zod";
import { prisma } from "../db.js";
import { buildExportSelection } from "../exports/buildSelection.js";

export const exportsRouter = Router();

const selectionSchema = z.object({
  supplierId: z.string().min(1),
  projectIds: z.array(z.string().min(1)).min(1, "Выберите хотя бы одну модель"),
});

exportsRouter.post("/preview", async (req, res) => {
  const parsed = selectionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Некорректные данные", details: parsed.error.flatten() });
  try {
    const selection = await buildExportSelection(parsed.data.supplierId, parsed.data.projectIds);
    const currencies = Object.keys(selection.currencyBreakdown);
    res.json({
      supplier: selection.supplier,
      projectCount: selection.projects.length,
      componentCount: selection.componentCount,
      crossReferenceCount: selection.rows.length + selection.conflicts.length,
      noPriceCount: selection.noPriceComponents.length,
      noOfferCount: selection.noOfferComponents.length,
      conflictCount: selection.conflicts.length,
      uniqueRowCount: selection.rows.length,
      currencyBreakdown: selection.currencyBreakdown,
      isMixedCurrency: currencies.length > 1,
      rows: selection.rows,
      noPriceComponents: selection.noPriceComponents,
      noOfferComponents: selection.noOfferComponents,
      conflicts: selection.conflicts,
    });
  } catch (e: any) {
    res.status(e.status ?? 400).json({ error: e.message ?? "Не удалось построить выборку" });
  }
});

function buildFilename(supplierCode: string, projectNames: string[]): string {
  const tokens = Array.from(
    new Set(
      projectNames.map((n) => (n.trim().split(/\s+/)[0] || n).toUpperCase().replace(/[^A-ZА-Я0-9]/g, "")),
    ),
  ).filter(Boolean);
  const modelsPart = tokens.length <= 4 ? tokens.join("_") : `${tokens.length}MODELS`;
  const date = new Date().toISOString().slice(0, 10);
  return `${supplierCode}_${modelsPart}_${date}.xlsx`;
}

const downloadSchema = selectionSchema.extend({
  currency: z.string().trim().min(1).max(10).optional(),
});

exportsRouter.post("/download", async (req, res) => {
  const parsed = downloadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Некорректные данные", details: parsed.error.flatten() });

  let selection;
  try {
    selection = await buildExportSelection(parsed.data.supplierId, parsed.data.projectIds);
  } catch (e: any) {
    return res.status(e.status ?? 400).json({ error: e.message ?? "Не удалось построить выборку" });
  }

  const currencies = Object.keys(selection.currencyBreakdown);
  let rows = selection.rows;
  if (currencies.length > 1) {
    if (!parsed.data.currency) {
      return res.status(409).json({
        error: "В выборке несколько валют — выгрузка в одном файле с разными валютами не формируется",
        currencyBreakdown: selection.currencyBreakdown,
      });
    }
    rows = rows.filter((r) => r.currency === parsed.data.currency);
  }

  if (rows.length === 0) {
    return res.status(400).json({ error: "Нечего выгружать — нет ни одной строки с ценой в выбранной валюте" });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Кроссировки");
  sheet.getColumn(1).numFmt = "@"; // текстовый формат — сохраняет ведущие нули артикула
  sheet.getColumn(2).numFmt = "#,##0.00";
  sheet.addRow(["Артикул поставщика", "Цена"]);
  for (const row of rows) {
    const r = sheet.addRow([row.supplierArticle, Number(row.price)]);
    r.getCell(1).numFmt = "@";
    r.getCell(1).value = row.supplierArticle; // явно как текст, не число
  }

  const excludedRows = selection.noPriceComponents.length + selection.noOfferComponents.length + selection.conflicts.length;
  await prisma.supplierExportHistory.create({
    data: {
      supplierId: selection.supplier.id,
      selectedProjectIds: JSON.stringify(parsed.data.projectIds),
      rowsExported: rows.length,
      excludedRows,
      exportStatus: "success",
    },
  });

  const filename = buildFilename(selection.supplier.code, selection.projects.map((p) => p.name));
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
});

exportsRouter.get("/history", async (req, res) => {
  const supplierId = typeof req.query.supplierId === "string" ? req.query.supplierId : undefined;
  const rows = await prisma.supplierExportHistory.findMany({
    where: supplierId ? { supplierId } : undefined,
    orderBy: { exportedAt: "desc" },
    take: 100,
    include: { supplier: { select: { name: true, code: true } } },
  });
  res.json(rows.map((r) => ({ ...r, selectedProjectIds: JSON.parse(r.selectedProjectIds) })));
});
