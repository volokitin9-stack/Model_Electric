import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

// Единственный источник правды — project/plan.yaml, который ведёт
// отдельный агент (коммитит в репозиторий вместе с сгенерированными
// project/GANTT.md и project/Gantt.xlsx, см. tools/build_gantt.py).
// Сервер не хранит копию в БД — просто читает файл заново на каждый
// запрос (он маленький), чтобы не держать второй источник правды.
// Расположение файла — то же соглашение, что и export/price_import.json
// в src/exchangeRates.ts: в проде абсолютный путь из Dockerfile, в
// локальной разработке — на два уровня выше cwd (apps/server).
const PROD_PATH = "/project/plan.yaml";
const DEV_PATH = path.resolve(process.cwd(), "..", "..", "project", "plan.yaml");

export type GanttStatus = "done" | "active" | "planned" | "blocked";

export type GanttTask = {
  id: string;
  name: string;
  status: GanttStatus;
  milestone: boolean;
  start: string | null;
  end: string | null;
  date: string | null;
  period: string | null;
  owner: string | null;
  note: string | null;
  after: string[];
  progress: number;
  overdue: boolean;
  subtasks: GanttTask[];
};

export type GanttPhase = { id: string; name: string; tasks: GanttTask[] };

export type GanttPlan = {
  project: string;
  updated: string | null;
  phases: GanttPhase[];
  summary: { total: number; done: number; active: number; planned: number; blocked: number; overdue: number; progress: number };
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function computeTask(raw: any, now: string): GanttTask {
  const status: GanttStatus = raw.status ?? "planned";
  const milestone = Boolean(raw.milestone);
  const end = milestone ? (raw.date ?? null) : (raw.end ?? null);
  // Та же логика, что генератор tools/build_gantt.py: срок прошёл,
  // статус не done — "просрочено / подтвердить".
  const overdue = Boolean(end && end < now && status !== "done");
  const progress = typeof raw.progress === "number" ? raw.progress : status === "done" ? 100 : 0;
  const subtasks = Array.isArray(raw.subtasks) ? raw.subtasks.map((s: any) => computeTask(s, now)) : [];
  return {
    id: String(raw.id),
    name: raw.name,
    status,
    milestone,
    start: milestone ? null : (raw.start ?? null),
    end,
    date: milestone ? (raw.date ?? null) : null,
    period: raw.period ?? null,
    owner: raw.owner ?? null,
    note: raw.note ?? null,
    after: Array.isArray(raw.after) ? raw.after.map(String) : [],
    progress,
    overdue,
    subtasks,
  };
}

function flatten(tasks: GanttTask[]): GanttTask[] {
  return tasks.flatMap((t) => [t, ...flatten(t.subtasks)]);
}

function load(): GanttPlan | null {
  for (const p of [PROD_PATH, DEV_PATH]) {
    try {
      if (!fs.existsSync(p)) continue;
      const raw = YAML.parse(fs.readFileSync(p, "utf8"));
      const now = today();
      const phases: GanttPhase[] = (raw.phases ?? []).map((ph: any) => ({
        id: String(ph.id),
        name: ph.name,
        tasks: (ph.tasks ?? []).map((t: any) => computeTask(t, now)),
      }));
      const allTasks = flatten(phases.flatMap((ph) => ph.tasks));
      const summary = {
        total: allTasks.length,
        done: allTasks.filter((t) => t.status === "done").length,
        active: allTasks.filter((t) => t.status === "active").length,
        planned: allTasks.filter((t) => t.status === "planned").length,
        blocked: allTasks.filter((t) => t.status === "blocked").length,
        overdue: allTasks.filter((t) => t.overdue).length,
        progress: allTasks.length
          ? Math.round(allTasks.reduce((sum, t) => sum + t.progress, 0) / allTasks.length)
          : 0,
      };
      return { project: raw.project, updated: raw.updated ?? null, phases, summary };
    } catch {
      // пробуем следующий путь / файл повреждён — вернём null ниже
    }
  }
  return null;
}

export function getGanttPlan(): GanttPlan | null {
  return load();
}
