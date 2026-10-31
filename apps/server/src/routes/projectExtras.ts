import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../db.js";
import { buildProjectSummary } from "./projectComponents.js";

export const projectSummaryRouter = Router({ mergeParams: true });
export const projectImagesRouter = Router({ mergeParams: true });
export const projectCompetitorsRouter = Router({ mergeParams: true });

projectSummaryRouter.get("/", async (req, res) => {
  const { projectId } = req.params as { projectId: string };
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return res.status(404).json({ error: "Проект не найден" });
  const summary = await buildProjectSummary(projectId);
  res.json(summary);
});

// --- Фото комплекта (§4.2) --------------------------------------------

const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads", "projects");
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const projectId = (req.params as { projectId: string }).projectId;
    const dir = path.join(UPLOAD_ROOT, projectId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 МБ
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      cb(new Error("Разрешены только JPG, PNG и WEBP"));
      return;
    }
    cb(null, true);
  },
});

projectImagesRouter.get("/", async (req, res) => {
  const { projectId } = req.params as { projectId: string };
  const images = await prisma.projectImage.findMany({ where: { projectId }, orderBy: { uploadedAt: "desc" } });
  res.json(images);
});

projectImagesRouter.post("/", (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    const { projectId } = req.params as { projectId: string };
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: "Проект не найден" });
    if (!req.file) return res.status(400).json({ error: "Файл не получен" });

    const relPath = `/uploads/projects/${projectId}/${req.file.filename}`;
    const image = await prisma.projectImage.create({
      data: {
        projectId,
        imagePath: relPath,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
      },
    });
    res.status(201).json(image);
  });
});

projectImagesRouter.delete("/:imageId", async (req, res) => {
  const { projectId, imageId } = req.params as { projectId: string; imageId: string };
  const image = await prisma.projectImage.findFirst({ where: { id: imageId, projectId } });
  if (!image) return res.status(404).json({ error: "Изображение не найдено" });
  await prisma.projectImage.delete({ where: { id: imageId } });
  const absPath = path.join(process.cwd(), image.imagePath.replace(/^\//, ""));
  fs.unlink(absPath, () => {});
  res.status(204).end();
});

// --- Конкурент на Ozon (§4.3) ------------------------------------------

const competitorSchema = z.object({
  sellerName: z.string().trim().min(1).max(200),
  productName: z.string().trim().min(1).max(300),
  productUrl: z.string().trim().url().nullable().optional(),
  price: z.coerce.number().nonnegative().nullable().optional(),
  currency: z.string().trim().max(10).nullable().optional(),
  comment: z.string().nullable().optional(),
});

projectCompetitorsRouter.get("/", async (req, res) => {
  const { projectId } = req.params as { projectId: string };
  const rows = await prisma.projectCompetitor.findMany({ where: { projectId }, orderBy: { updatedAt: "desc" } });
  res.json(rows);
});

projectCompetitorsRouter.post("/", async (req, res) => {
  const { projectId } = req.params as { projectId: string };
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return res.status(404).json({ error: "Проект не найден" });
  const parsed = competitorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Некорректные данные", details: parsed.error.flatten() });
  const row = await prisma.projectCompetitor.create({ data: { projectId, ...parsed.data } });
  res.status(201).json(row);
});

projectCompetitorsRouter.patch("/:id", async (req, res) => {
  const { projectId, id } = req.params as { projectId: string; id: string };
  const existing = await prisma.projectCompetitor.findFirst({ where: { id, projectId } });
  if (!existing) return res.status(404).json({ error: "Запись не найдена" });
  const parsed = competitorSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Некорректные данные", details: parsed.error.flatten() });
  const row = await prisma.projectCompetitor.update({ where: { id }, data: { ...parsed.data, checkedAt: new Date() } });
  res.json(row);
});

projectCompetitorsRouter.delete("/:id", async (req, res) => {
  const { projectId, id } = req.params as { projectId: string; id: string };
  const existing = await prisma.projectCompetitor.findFirst({ where: { id, projectId } });
  if (!existing) return res.status(404).json({ error: "Запись не найдена" });
  await prisma.projectCompetitor.delete({ where: { id } });
  res.status(204).end();
});
