import path from "node:path";
import fs from "node:fs";
import express from "express";
import cors from "cors";
import { projectsRouter } from "./routes/projects.js";
import { changelogRouter } from "./routes/changelog.js";
import { categoriesRouter, componentsRouter } from "./routes/components.js";
import { projectComponentsRouter } from "./routes/projectComponents.js";
import { suppliersRouter } from "./routes/suppliers.js";
import { crossReferencesRouter } from "./routes/crossReferences.js";
import { projectSummaryRouter, projectImagesRouter, projectCompetitorsRouter } from "./routes/projectExtras.js";
import { importsRouter } from "./routes/imports.js";
import { exportsRouter } from "./routes/exports.js";

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/projects/:projectId/summary", projectSummaryRouter);
app.use("/api/projects/:projectId/components", projectComponentsRouter);
app.use("/api/projects/:projectId/images", projectImagesRouter);
app.use("/api/projects/:projectId/competitors", projectCompetitorsRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/changelog", changelogRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/components", componentsRouter);
app.use("/api/suppliers", suppliersRouter);
app.use("/api/cross-references", crossReferencesRouter);
app.use("/api/imports", importsRouter);
app.use("/api/exports", exportsRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use("/api", (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
});

// Прод-деплой: один сервис отдаёт и API, и собранный веб-клиент — проще
// для доступа с телефона (один URL, без CORS). В dev-режиме (apps/web
// поднят отдельно через Vite) этой папки нет — просто ничего не монтируем.
const webDist = path.resolve(process.cwd(), "..", "web", "dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api|\/uploads).*/, (_req, res) => {
    res.sendFile(path.join(webDist, "index.html"));
  });
  console.log(`Раздаю собранный веб-клиент из ${webDist}`);
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API сервер "Модельная электрика" слушает порт ${PORT}`);
});
