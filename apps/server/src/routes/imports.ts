import { Router } from "express";
import multer from "multer";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../db.js";
import { recordPrice } from "../pricing.js";
import { assertSupportedFile, inspectFile, parseRows, type ColumnMapping } from "../imports/parseFile.js";
import { buildImportDiff } from "../imports/diff.js";

export const importsRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Если задан AGENT_API_TOKEN, запросы с заголовком x-agent-token обязаны
// его предъявить и он обязан совпасть (так Local Import Agent — то есть
// неинтерактивный клиент, а не человек в браузере — ходит по
// отдельному защищённому каналу, ТЗ §17.3). Запросы без этого
// заголовка (обычные вызовы из веб-интерфейса) не блокируются — в
// приложении пока нет полноценной системы пользователей, это
// отдельный минимальный контур именно для агента, а не замена
// полноценной авторизации.
importsRouter.use((req, res, next) => {
  const token = process.env.AGENT_API_TOKEN;
  const presented = req.header("x-agent-token");
  if (token && presented && presented !== token) {
    return res.status(401).json({ error: "Неверный токен агента" });
  }
  next();
});

// --- Шаблоны сопоставления колонок (SupplierImportProfile) ------------

const columnMappingSchema = z.object({
  ourArticle: z.number().int().nonnegative().optional(),
  supplierArticle: z.number().int().nonnegative(),
  price: z.number().int().nonnegative().optional(),
  currency: z.number().int().nonnegative().optional(),
  availability: z.number().int().nonnegative().optional(),
  moq: z.number().int().nonnegative().optional(),
  leadTimeDays: z.number().int().nonnegative().optional(),
});

const profileSchema = z.object({
  supplierId: z.string().min(1),
  profileName: z.string().trim().min(1).max(100),
  fileType: z.enum(["xlsx", "xls", "csv"]),
  sheetName: z.string().nullable().optional(),
  headerRow: z.coerce.number().int().positive().default(1),
  dataStartRow: z.coerce.number().int().positive().default(2),
  columnMapping: columnMappingSchema,
  localSourceKey: z.string().trim().nullable().optional(),
});

importsRouter.get("/profiles", async (req, res) => {
  const supplierId = typeof req.query.supplierId === "string" ? req.query.supplierId : undefined;
  const profiles = await prisma.supplierImportProfile.findMany({
    where: supplierId ? { supplierId } : undefined,
    orderBy: { createdAt: "desc" },
  });
  res.json(profiles.map((p) => ({ ...p, columnMapping: JSON.parse(p.columnMapping) })));
});

importsRouter.post("/profiles", async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Некорректные данные", details: parsed.error.flatten() });
  const { columnMapping, ...rest } = parsed.data;
  const profile = await prisma.supplierImportProfile.create({
    data: { ...rest, columnMapping: JSON.stringify(columnMapping) },
  });
  res.status(201).json({ ...profile, columnMapping });
});

importsRouter.patch("/profiles/:id", async (req, res) => {
  const parsed = profileSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Некорректные данные", details: parsed.error.flatten() });
  const { columnMapping, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (columnMapping) data.columnMapping = JSON.stringify(columnMapping);
  try {
    const profile = await prisma.supplierImportProfile.update({ where: { id: req.params.id }, data });
    res.json({ ...profile, columnMapping: JSON.parse(profile.columnMapping) });
  } catch (e: any) {
    if (e.code === "P2025") return res.status(404).json({ error: "Шаблон не найден" });
    throw e;
  }
});

// --- Шаг настройки: разбор заголовков для интерактивного маппинга -----

importsRouter.post("/inspect", (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Файл не получен" });
    try {
      assertSupportedFile(req.file.originalname, req.file.size);
      const sheetName = typeof req.body.sheetName === "string" ? req.body.sheetName : undefined;
      const info = inspectFile(req.file.buffer, sheetName);
      res.json(info);
    } catch (e: any) {
      res.status(400).json({ error: e.message ?? "Не удалось прочитать файл" });
    }
  });
});

// --- Предпросмотр и применение импорта ---------------------------------

function sha256(buf: Buffer) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function runPreview(params: {
  supplierId: string;
  file: Express.Multer.File;
  profileId?: string;
  parseConfig?: { sheetName?: string | null; headerRow: number; dataStartRow: number; columnMapping: ColumnMapping };
}) {
  const { supplierId, file } = params;
  assertSupportedFile(file.originalname, file.size);

  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) throw Object.assign(new Error("Поставщик не найден"), { status: 404 });

  let config = params.parseConfig;
  let profileId = params.profileId;
  if (!config) {
    if (!profileId) throw Object.assign(new Error("Укажите profileId или parseConfig"), { status: 400 });
    const profile = await prisma.supplierImportProfile.findUnique({ where: { id: profileId } });
    if (!profile) throw Object.assign(new Error("Шаблон импорта не найден"), { status: 404 });
    config = {
      sheetName: profile.sheetName,
      headerRow: profile.headerRow,
      dataStartRow: profile.dataStartRow,
      columnMapping: JSON.parse(profile.columnMapping),
    };
  }

  const sourceHash = sha256(file.buffer);

  // Защита от повторной обработки неизменённого файла (§6, §17.2).
  const previouslyApplied = await prisma.supplierImportBatch.findFirst({
    where: { supplierId, sourceHash, status: "applied" },
    orderBy: { importedAt: "desc" },
  });
  if (previouslyApplied) {
    return { alreadyImported: true as const, batch: previouslyApplied };
  }

  const rows = parseRows(file.buffer, config);
  const diff = await buildImportDiff(supplierId, rows);

  const batch = await prisma.supplierImportBatch.create({
    data: {
      supplierId,
      profileId: profileId ?? null,
      sourceFile: file.originalname,
      sourceHash,
      rowsRead: rows.length,
      status: "previewed",
      reportJson: JSON.stringify({ diff, config }),
    },
  });

  return { alreadyImported: false as const, batch, diff };
}

importsRouter.post("/preview", (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Файл не получен" });
    const supplierId = req.body.supplierId as string | undefined;
    const profileId = req.body.profileId as string | undefined;
    if (!supplierId) return res.status(400).json({ error: "Укажите supplierId" });

    let parseConfig;
    if (req.body.parseConfig) {
      try {
        parseConfig = JSON.parse(req.body.parseConfig);
      } catch {
        return res.status(400).json({ error: "parseConfig должен быть JSON" });
      }
    }

    try {
      const result = await runPreview({ supplierId, file: req.file, profileId, parseConfig });
      if (result.alreadyImported) {
        return res.json({ alreadyImported: true, message: "Этот файл уже был импортирован без изменений с прошлого раза", batch: result.batch });
      }
      res.json({ alreadyImported: false, batchId: result.batch.id, diff: result.diff });
    } catch (e: any) {
      res.status(e.status ?? 400).json({ error: e.message ?? "Не удалось разобрать файл" });
    }
  });
});

importsRouter.post("/:batchId/confirm", async (req, res) => {
  const batch = await prisma.supplierImportBatch.findUnique({ where: { id: req.params.batchId } });
  if (!batch) return res.status(404).json({ error: "Пакет импорта не найден" });
  if (batch.status !== "previewed") {
    return res.status(409).json({ error: `Пакет уже в статусе "${batch.status}" — повторное применение невозможно` });
  }
  if (!batch.reportJson) return res.status(500).json({ error: "У пакета нет сохранённого отчёта" });

  const { diff } = JSON.parse(batch.reportJson) as { diff: Awaited<ReturnType<typeof buildImportDiff>> };

  let created = 0;
  let updated = 0;

  for (const row of diff.newLinks as any[]) {
    const xref = await prisma.supplierCrossReference.create({
      data: {
        supplierId: batch.supplierId,
        componentId: row.componentId,
        supplierArticle: row.supplierArticle,
        source: "import",
      },
    });
    if (row.price != null) {
      await recordPrice(xref.id, {
        price: row.price, currency: row.currency, minimumOrderQuantity: row.moq ?? null,
        availability: row.availability ?? null, leadTimeDays: row.leadTimeDays ?? null, sourceFileId: batch.id,
      });
    }
    created++;
  }

  for (const row of diff.priceUpdates as any[]) {
    await recordPrice(row.crossReferenceId, {
      price: row.newPrice, currency: row.currency, minimumOrderQuantity: row.moq ?? null,
      availability: row.availability ?? null, leadTimeDays: row.leadTimeDays ?? null, sourceFileId: batch.id,
    });
    updated++;
  }

  const rejected = diff.counts.unknownArticles + diff.counts.orphanPrices + diff.counts.duplicates + diff.counts.errors;

  const updatedBatch = await prisma.supplierImportBatch.update({
    where: { id: batch.id },
    data: { status: "applied", rowsCreated: created, rowsUpdated: updated, rowsRejected: rejected },
  });

  res.json(updatedBatch);
});

importsRouter.get("/batches", async (req, res) => {
  const supplierId = typeof req.query.supplierId === "string" ? req.query.supplierId : undefined;
  const batches = await prisma.supplierImportBatch.findMany({
    where: supplierId ? { supplierId } : undefined,
    orderBy: { importedAt: "desc" },
    take: 100,
  });
  res.json(batches);
});

importsRouter.get("/batches/:id", async (req, res) => {
  const batch = await prisma.supplierImportBatch.findUnique({ where: { id: req.params.id } });
  if (!batch) return res.status(404).json({ error: "Пакет не найден" });
  res.json({ ...batch, report: batch.reportJson ? JSON.parse(batch.reportJson) : null });
});
