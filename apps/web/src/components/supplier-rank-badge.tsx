import { cn } from "@/lib/utils";

// Рейтинг 1-3 по числу кроссировок относительно других поставщиков
// (1 = верхняя треть — больше всего разъёмов), см. apps/server/src/routes/suppliers.ts.
const TONE: Record<1 | 2 | 3, string> = {
  1: "bg-[var(--status-done-bg)] text-[var(--status-done-fg)]",
  2: "bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)]",
  3: "bg-[var(--status-waiting-bg)] text-[var(--status-waiting-fg)]",
};

export function SupplierRankBadge({ rank, className }: { rank: 1 | 2 | 3; className?: string }) {
  return (
    <span className={cn("status-chip", TONE[rank], className)} title="Рейтинг по числу кроссировок (разъёмов) среди поставщиков">
      Рейтинг {rank}
    </span>
  );
}
