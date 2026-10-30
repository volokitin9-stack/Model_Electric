import express from "express";
import cors from "cors";
import { projectsRouter } from "./routes/projects.js";
import { changelogRouter } from "./routes/changelog.js";

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/projects", projectsRouter);
app.use("/api/changelog", changelogRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
});

app.listen(PORT, () => {
  console.log(`API сервер "Модельная электрика" слушает порт ${PORT}`);
});
