import { cn } from "@/lib/utils";
import { KPI_LABELS, type KpiKey } from "@/lib/kpi";

const ICON_TONE: Record<KpiKey, string> = {
  total: "text-foreground",
  active: "text-[var(--status-progress-fg)]",
  waiting: "text-[var(--status-waiting-fg)]",
  overdue: "text-[var(--status-problem-fg)]",
  ready: "text-[var(--status-done-fg)]",
  completed: "text-muted-foreground",
};

const ORDER: KpiKey[] = ["total", "active", "waiting", "overdue", "ready", "completed"];

export function KpiCards({
  counts,
  active,
  onToggle,
}: {
  counts: Record<KpiKey, number>;
  active: KpiKey | null;
  onToggle: (key: KpiKey) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
      {ORDER.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onToggle(key)}
          className={cn(
            "rounded-lg border border-border bg-card px-3.5 py-3 text-left shadow-sm transition-colors hover:border-primary/50",
            active === key && "border-primary ring-1 ring-primary",
          )}
        >
          <div className={cn("tabular text-2xl font-semibold leading-none", ICON_TONE[key])}>{counts[key]}</div>
          <div className="mt-1.5 text-xs text-muted-foreground">{KPI_LABELS[key]}</div>
        </button>
      ))}
    </div>
  );
}
