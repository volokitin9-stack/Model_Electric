import type { Project } from "./types";

export type KpiKey = "total" | "active" | "waiting" | "overdue" | "ready" | "completed";

export const KPI_LABELS: Record<KpiKey, string> = {
  total: "Всего проектов",
  active: "Активные",
  waiting: "Ожидают действий",
  overdue: "Просрочены",
  ready: "Готовы к запуску",
  completed: "Завершены",
};

export function isOverdue(p: Project, today: string): boolean {
  if (!p.plannedDate) return false;
  if (p.overallStatus === "completed" || p.overallStatus === "cancelled") return false;
  return p.plannedDate.slice(0, 10) < today;
}

export function matchesKpi(p: Project, key: KpiKey, today: string): boolean {
  switch (key) {
    case "total":
      return true;
    case "active":
      return p.overallStatus === "active";
    case "waiting":
      return p.overallStatus === "waiting";
    case "overdue":
      return isOverdue(p, today);
    case "ready":
      return p.overallStatus === "ready";
    case "completed":
      return p.overallStatus === "completed";
  }
}

export function computeKpis(projects: Project[]): Record<KpiKey, number> {
  const today = new Date().toISOString().slice(0, 10);
  const keys: KpiKey[] = ["total", "active", "waiting", "overdue", "ready", "completed"];
  const result = {} as Record<KpiKey, number>;
  for (const key of keys) {
    result[key] = projects.filter((p) => matchesKpi(p, key, today)).length;
  }
  return result;
}
