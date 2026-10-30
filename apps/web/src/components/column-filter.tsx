import { useMemo, useState } from "react";
import type { Column } from "@tanstack/react-table";
import { Filter, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * Фильтр в духе Excel: для текстовых колонок — поиск по подстроке, для
 * перечислимых (статусы) — чекбоксы по значениям, встречающимся в
 * текущих данных, с "выбрать всё/снять всё" и мини-поиском по списку.
 */
export function ColumnFilter<TData>({
  column,
  kind,
  labelOf,
}: {
  column: Column<TData, unknown>;
  kind: "text" | "enum" | "date";
  /** Для kind="enum": как подписать значение. */
  labelOf?: (raw: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filterValue = column.getFilterValue();
  const isActive =
    kind === "text"
      ? Boolean(filterValue)
      : kind === "date"
        ? Boolean(filterValue && ((filterValue as { from?: string; to?: string }).from || (filterValue as { from?: string; to?: string }).to))
        : Array.isArray(filterValue);

  const facetedValues = column.getFacetedUniqueValues();
  // Текстовые колонки тоже дают facetedValues (включая null для пустых
  // ячеек) — отфильтровываем null/undefined, enum-ветка ниже
  // использует этот список, текстовая — нет.
  const allValues = useMemo(
    () => Array.from(facetedValues.keys()).filter((v): v is string => v != null).sort(),
    [facetedValues],
  );
  const visibleValues = useMemo(
    () => allValues.filter((v) => (labelOf?.(v) ?? v).toLowerCase().includes(query.toLowerCase())),
    [allValues, query, labelOf],
  );

  // filterValue undefined = ничего не выбрано вручную => визуально все
  // отмечены (фильтр неактивен). Пустой массив, в отличие от undefined,
  // означает осознанный выбор "показать ничего" ("Снять всё").
  const selected = Array.isArray(filterValue) ? (filterValue as string[]) : undefined;
  const effectiveSelected = selected ?? allValues;

  function toggleValue(v: string, checked: boolean) {
    const next = checked
      ? Array.from(new Set([...effectiveSelected, v]))
      : effectiveSelected.filter((x) => x !== v);
    column.setFilterValue(next.length === allValues.length ? undefined : next);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "ml-1 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground",
            isActive && "text-primary",
          )}
          aria-label="Фильтр"
        >
          <Filter className="h-3.5 w-3.5" fill={isActive ? "currentColor" : "none"} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 normal-case" align="start">
        {kind === "date" ? (
          <div className="flex flex-col gap-2">
            <label className="text-xs text-muted-foreground">С даты</label>
            <Input
              type="date"
              className="h-8 text-sm"
              value={(filterValue as { from?: string } | undefined)?.from ?? ""}
              onChange={(e) =>
                column.setFilterValue((prev: { from?: string; to?: string } | undefined) => {
                  const next = { ...prev, from: e.target.value || undefined };
                  return next.from || next.to ? next : undefined;
                })
              }
            />
            <label className="text-xs text-muted-foreground">По дату</label>
            <Input
              type="date"
              className="h-8 text-sm"
              value={(filterValue as { to?: string } | undefined)?.to ?? ""}
              onChange={(e) =>
                column.setFilterValue((prev: { from?: string; to?: string } | undefined) => {
                  const next = { ...prev, to: e.target.value || undefined };
                  return next.from || next.to ? next : undefined;
                })
              }
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 justify-start px-1 text-xs text-muted-foreground"
              onClick={() => column.setFilterValue(undefined)}
            >
              <X className="h-3 w-3" /> Сбросить
            </Button>
          </div>
        ) : kind === "text" ? (
          <div className="flex flex-col gap-2">
            <Input
              autoFocus
              placeholder="Содержит…"
              value={(filterValue as string) ?? ""}
              onChange={(e) => column.setFilterValue(e.target.value || undefined)}
              className="h-8 text-sm"
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 justify-start px-1 text-xs text-muted-foreground"
              onClick={() => column.setFilterValue(undefined)}
            >
              <X className="h-3 w-3" /> Сбросить
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Input
              placeholder="Поиск…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 text-sm"
            />
            <div className="flex items-center justify-between px-0.5 text-xs text-muted-foreground">
              <button className="hover:text-foreground" onClick={() => column.setFilterValue(undefined)}>
                Выбрать всё
              </button>
              <button className="hover:text-foreground" onClick={() => column.setFilterValue([])}>
                Снять всё
              </button>
            </div>
            <Separator />
            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto pr-1">
              {visibleValues.length === 0 && (
                <div className="py-2 text-center text-xs text-muted-foreground">Нет значений</div>
              )}
              {visibleValues.map((v) => (
                <label key={v} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                  <Checkbox
                    checked={selected ? selected.includes(v) : true}
                    onCheckedChange={(c) => toggleValue(v, Boolean(c))}
                  />
                  <span className="truncate">{labelOf?.(v) ?? v}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{facetedValues.get(v)}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
