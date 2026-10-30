import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUS_LABELS } from "@/lib/statuses";
import { cn } from "@/lib/utils";
import { toneClass } from "@/components/status-badge";

export function StatusSelect({
  value,
  options,
  onChange,
  disabled,
  className,
}: {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        className={cn(
          "h-7 w-full border-transparent px-2 py-0 text-xs font-medium shadow-none hover:border-input",
          toneClass(value),
          className,
        )}
      >
        <SelectValue>{STATUS_LABELS[value] ?? value}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt} value={opt} className="text-xs">
            {STATUS_LABELS[opt] ?? opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
