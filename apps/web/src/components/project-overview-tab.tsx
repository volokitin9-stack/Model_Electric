import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { ProjectImageBlock } from "@/components/project-image-block";
import { ProjectCompetitorBlock } from "@/components/project-competitor-block";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { Project } from "@/lib/types";

function formatCostSummary(summary: Awaited<ReturnType<typeof api.projectSummary>>["costSummary"]): string {
  const entries = Object.entries(summary.totalsByCurrency);
  if (entries.length === 0) return "цена не определена";
  const text = entries.map(([cur, amount]) => `${amount} ${cur}`).join(" + ");
  if (summary.isPartial) return `${text} (частичная стоимость)`;
  return text;
}

export function ProjectOverviewTab({ project, onViewComponents }: { project: Project; onViewComponents: () => void }) {
  const summaryQuery = useQuery({ queryKey: ["project-summary", project.id], queryFn: () => api.projectSummary(project.id) });
  const componentsQuery = useQuery({ queryKey: ["project-components", project.id], queryFn: () => api.listProjectComponents(project.id) });

  const summary = summaryQuery.data;
  const topRows = (componentsQuery.data ?? []).slice(0, 5);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <KpiTile label="Прогресс" value={`${project.progress}%`} />
        <KpiTile label="Заполненность спецификации" value={summary ? `${summary.specFillPercent}%` : "…"} />
        <KpiTile label="Стоимость комплектующих" value={summary ? formatCostSummary(summary.costSummary) : "…"} isText />
        <KpiTile label="Поставщиков" value={summary?.supplierCount ?? "…"} />
        <KpiTile label="Не определено" value={summary?.missingCount ?? "…"} warn={(summary?.missingCount ?? 0) > 0} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-4">
          <ProjectImageBlock projectId={project.id} />
          <ProjectCompetitorBlock projectId={project.id} />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Спецификация (кратко)</div>
            <Button variant="link" size="sm" className="h-auto px-0 text-xs" onClick={onViewComponents}>
              Показать всё →
            </Button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60 text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">Артикул</th>
                  <th className="px-3 py-2 text-left">Наименование</th>
                  <th className="px-3 py-2 text-left">Кол-во</th>
                  <th className="px-3 py-2 text-left">Статус</th>
                </tr>
              </thead>
              <tbody>
                {topRows.map((pc) => (
                  <tr key={pc.id} className="border-b border-border">
                    <td className="px-3 py-2 font-medium">{pc.component.internalArticle}</td>
                    <td className="px-3 py-2">{pc.component.name}</td>
                    <td className="px-3 py-2 tabular">{pc.quantity}</td>
                    <td className="px-3 py-2">
                      <StatusBadge value={pc.status} />
                    </td>
                  </tr>
                ))}
                {topRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                      Спецификация пока пуста.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiTile({ label, value, warn, isText }: { label: string; value: number | string; warn?: boolean; isText?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3.5 py-3">
      <div className={`font-semibold leading-none ${isText ? "text-sm" : "tabular text-2xl"} ${warn ? "text-[var(--status-waiting-fg)]" : ""}`}>
        {value}
      </div>
      <div className="mt-1.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
