import { Router } from "express";
import { z } from "zod";
import { runSpecImportAgent } from "../specImport.js";

export const specImportRouter = Router();

const bodySchema = z.object({ apply: z.boolean().default(false) });

// POST /api/spec-import/run — предпросмотр (apply:false) или реальная
// запись (apply:true) данных из чертежей specs/Wiring_N в проекты.
// Кнопка "Обновить данные" на дашборде вызывает сначала без apply
// (показать план), затем с apply:true после подтверждения пользователем.
specImportRouter.post("/run", async (req, res) => {
  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Некорректные данные", details: parsed.error.flatten() });
  try {
    const report = await runSpecImportAgent(parsed.data.apply);
    res.json(report);
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Не удалось выполнить обновление" });
  }
});
