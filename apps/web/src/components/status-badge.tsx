import { cn } from "@/lib/utils";
import { STATUS_LABELS, STATUS_TONE, type StatusTone } from "@/lib/statuses";

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)]",
  progress: "bg-[var(--status-progress-bg)] text-[var(--status-progress-fg)]",
  waiting: "bg-[var(--status-waiting-bg)] text-[var(--status-waiting-fg)]",
  done: "bg-[var(--status-done-bg)] text-[var(--status-done-fg)]",
  problem: "bg-[var(--status-problem-bg)] text-[var(--status-problem-fg)]",
  cancelled: "bg-[var(--status-cancelled-bg)] text-[var(--status-cancelled-fg)] line-through decoration-1",
};

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  const tone = STATUS_TONE[value] ?? "neutral";
  return (
    <span className={cn("status-chip", TONE_CLASS[tone], className)}>
      {STATUS_LABELS[value] ?? value}
    </span>
  );
}

export function toneClass(value: string): string {
  const tone = STATUS_TONE[value] ?? "neutral";
  return TONE_CLASS[tone];
}
