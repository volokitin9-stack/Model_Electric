import { Router } from "express";
import { getGanttPlan } from "../gantt.js";

export const ganttRouter = Router();

// Источник правды — project/plan.yaml, который ведёт отдельный агент
// (коммитит его в репозиторий вместе с project/GANTT.md и
// project/Gantt.xlsx, см. tools/build_gantt.py). Сервер только читает
// и отдаёт структурированные данные для вкладки "График проекта".
ganttRouter.get("/", (_req, res) => {
  const plan = getGanttPlan();
  if (!plan) {
    return res.status(404).json({ error: "План проекта (project/plan.yaml) не найден" });
  }
  res.json(plan);
});
