import { cn } from "@/lib/utils";
import { ORIGIN_LABELS, ORIGIN_VALUES, type Origin } from "@/lib/statuses";

export type OriginFilter = "all" | Origin;

const OPTIONS: { value: OriginFilter; label: string }[] = [
  { value: "all", label: "Все" },
  ...ORIGIN_VALUES.map((v) => ({ value: v as OriginFilter, label: ORIGIN_LABELS[v] })),
];

/** Сегментированный переключатель Все/Отечественные/Иномарки — МАСТЕР-ТЗ §6. */
export function OriginToggle({ value, onChange }: { value: OriginFilter; onChange: (v: OriginFilter) => void }) {
  return (
    <div className="inline-flex rounded-md border border-border bg-muted p-0.5 text-sm">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-[5px] px-2.5 py-1 font-medium transition-colors",
            value === opt.value ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
