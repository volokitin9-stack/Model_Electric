import { Router } from "express";
import { prisma } from "../db.js";

export const changelogRouter = Router();

// GET /api/changelog?limit=50 — глобальный журнал изменений по всем
// проектам (для страницы "Журнал"), с именем проекта для контекста.
changelogRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const entries = await prisma.changeLogEntry.findMany({
    orderBy: { changedAt: "desc" },
    take: limit,
    include: { project: { select: { id: true, name: true } } },
  });
  res.json(entries);
});
