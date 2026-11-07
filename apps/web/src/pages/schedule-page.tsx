import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { GanttPlan, GanttStatus, GanttTask } from "@/lib/types";

const STATUS_LABELS: Record<GanttStatus, string> = {
  done: "Выполнено",
  active: "В работе",
  planned: "Запланировано",
  blocked: "Заблокировано",
};

const STATUS_BAR: Record<GanttStatus, string> = {
  done: "bg-[var(--status-done-fg)]",
  active: "bg-[var(--status-progress-fg)]",
  planned: "bg-[var(--status-neutral-fg)]",
  blocked: "bg-[var(--status-problem-fg)]",
};

const STATUS_BG: Record<GanttStatus, string> = {
  done: "bg-[var(--status-done-bg)]",
  active: "bg-[var(--status-progress-bg)]",
  planned: "bg-[var(--status-neutral-bg)]",
  blocked: "bg-[var(--status-problem-bg)]",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function flatten(tasks: GanttTask[]): GanttTask[] {
  return tasks.flatMap((t) => [t, ...flatten(t.subtasks)]);
}

function monthTicks(min: Date, max: Date): { date: Date; label: string }[] {
  const ticks: { date: Date; label: string }[] = [];
  const cur = new Date(min.getFullYear(), min.getMonth(), 1);
  while (cur <= max) {
    ticks.push({ date: new Date(cur), label: cur.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" }) });
    cur.setMonth(cur.getMonth() + 1);
  }
  return ticks;
}

function SummaryTile({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3.5 py-3 shadow-sm">
      <div className={cn("tabular text-2xl font-semibold leading-none", tone)}>{value}</div>
      <div className="mt-1.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function GanttRow({
  task,
  depth,
  min,
  spanMs,
  todayPct,
}: {
  task: GanttTask;
  depth: number;
  min: Date;
  spanMs: number;
  todayPct: number;
}) {
  const pct = (d: string) => ((new Date(d).getTime() - min.getTime()) / spanMs) * 100;

  return (
    <>
      <div className="contents">
        <div
          className={cn(
            "sticky left-0 z-10 flex min-w-0 items-center gap-1.5 border-b border-border bg-card px-3 py-2 text-sm",
            depth > 0 && "pl-8 text-muted-foreground",
          )}
          style={{ gridColumn: 1 }}
          title={task.note ? `${task.name}\n${task.note}` : task.name}
        >
          <span className="truncate">
            {depth > 0 ? "↳ " : ""}
            {task.id}. {task.name}
          </span>
          {task.overdue && (
            <AlertTriangle
              className="h-3.5 w-3.5 shrink-0 text-[var(--status-problem-fg)]"
              aria-label="Срок прошёл — подтвердить"
            />
          )}
        </div>
        <div className="relative border-b border-border py-2" style={{ gridColumn: 2 }}>
          <div className="pointer-events-none absolute top-0 h-full w-px bg-[var(--destructive)]/40" style={{ left: `${todayPct}%` }} />
          {task.milestone ? (
            <div
              className={cn("absolute top-1/2 h-3 w-3 -translate-y-1/2 rotate-45", STATUS_BAR[task.status])}
              style={{ left: `calc(${pct(task.date!)}% - 6px)` }}
              title={`${task.name} — ${fmtDate(task.date)}`}
            />
          ) : task.start && task.end ? (
            <div
              className={cn(
                "absolute top-1/2 h-4 -translate-y-1/2 rounded",
                STATUS_BG[task.status],
                task.overdue && "ring-1 ring-[var(--status-problem-fg)]",
              )}
              style={{ left: `${pct(task.start)}%`, width: `calc(${Math.max(pct(task.end) - pct(task.start), 0.4)}% )` }}
              title={`${task.name}\n${fmtDate(task.start)} – ${fmtDate(task.end)} · ${STATUS_LABELS[task.status]} · ${task.progress}%${task.owner ? ` · ${task.owner}` : ""}${task.overdue ? "\nСрок прошёл — подтвердить" : ""}`}
            >
              <div className={cn("h-full rounded", STATUS_BAR[task.status])} style={{ width: `${task.progress}%` }} />
            </div>
          ) : null}
        </div>
      </div>
      {task.subtasks.map((s) => (
        <GanttRow key={s.id} task={s} depth={depth + 1} min={min} spanMs={spanMs} todayPct={todayPct} />
      ))}
    </>
  );
}

function GanttChartView({ plan }: { plan: GanttPlan }) {
  const allTasks = useMemo(() => flatten(plan.phases.flatMap((p) => p.tasks)), [plan]);

  const { min, max } = useMemo(() => {
    const dates = allTasks.flatMap((t) => [t.start, t.end, t.date]).filter((d): d is string => Boolean(d)).map((d) => new Date(d));
    const today = new Date();
    dates.push(today);
    const minT = Math.min(...dates.map((d) => d.getTime()));
    const maxT = Math.max(...dates.map((d) => d.getTime()));
    const pad = (maxT - minT) * 0.03;
    return { min: new Date(minT - pad), max: new Date(maxT + pad) };
  }, [allTasks]);

  const spanMs = max.getTime() - min.getTime();
  const todayPct = ((new Date().getTime() - min.getTime()) / spanMs) * 100;
  const ticks = useMemo(() => monthTicks(min, max), [min, max]);

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <div className="grid min-w-[1100px]" style={{ gridTemplateColumns: "280px 1fr" }}>
        {/* Шапка временной шкалы */}
        <div className="contents">
          <div className="sticky left-0 z-20 border-b border-border bg-muted/95 px-3 py-2 text-xs font-medium text-muted-foreground" style={{ gridColumn: 1 }}>
            Задача
          </div>
          <div className="relative border-b border-border bg-muted/95 py-2" style={{ gridColumn: 2, minHeight: 32 }}>
            {ticks.map((t, i) => (
              <div
                key={i}
                className="absolute top-0 h-full border-l border-border/70 pl-1 text-[11px] text-muted-foreground"
                style={{ left: `${((t.date.getTime() - min.getTime()) / spanMs) * 100}%` }}
              >
                {t.label}
              </div>
            ))}
          </div>
        </div>

        {plan.phases.map((phase) => (
          <div className="contents" key={phase.id}>
            <div className="contents">
              <div className="sticky left-0 z-10 border-b border-border bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-foreground)]" style={{ gridColumn: 1 }}>
                {phase.name}
              </div>
              <div className="relative border-b border-border bg-[var(--accent)]/40" style={{ gridColumn: 2 }}>
                <div className="absolute top-0 h-full w-px bg-[var(--destructive)]" style={{ left: `${todayPct}%` }} />
              </div>
            </div>
            {phase.tasks.map((t) => (
              <GanttRow key={t.id} task={t} depth={0} min={min} spanMs={spanMs} todayPct={todayPct} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SchedulePage() {
  const query = useQuery({ queryKey: ["gantt"], queryFn: api.getGantt });

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">График проекта</h1>
        {query.data?.updated && (
          <span className="text-xs text-muted-foreground">Обновлено: {fmtDate(query.data.updated)}</span>
        )}
      </div>

      {query.isLoading && <div className="py-10 text-center text-sm text-muted-foreground">Загрузка графика…</div>}
      {query.isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Не удалось загрузить план проекта. Файл project/plan.yaml ведёт отдельный агент — убедитесь, что он есть в
          репозитории.
        </div>
      )}

      {query.data && (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <SummaryTile label="Всего задач и вех" value={query.data.summary.total} />
            <SummaryTile label="Выполнено" value={query.data.summary.done} tone="text-[var(--status-done-fg)]" />
            <SummaryTile label="В работе" value={query.data.summary.active} tone="text-[var(--status-progress-fg)]" />
            <SummaryTile label="Запланировано" value={query.data.summary.planned} tone="text-muted-foreground" />
            <SummaryTile label="Срок прошёл — подтвердить" value={query.data.summary.overdue} tone="text-[var(--status-problem-fg)]" />
            <SummaryTile label="Общий прогресс" value={`${query.data.summary.progress}%`} tone="text-primary" />
          </div>

          <GanttChartView plan={query.data} />

          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            {(Object.keys(STATUS_LABELS) as GanttStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className={cn("inline-block h-2.5 w-2.5 rounded-sm", STATUS_BAR[s])} />
                {STATUS_LABELS[s]}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-[var(--status-problem-fg)]" />
              Срок прошёл — подтвердить
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-px bg-[var(--destructive)]" />
              Сегодня
            </span>
          </div>
        </>
      )}
    </div>
  );
}
