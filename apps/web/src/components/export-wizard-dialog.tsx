import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { api, downloadExport } from "@/lib/api";
import type { Supplier } from "@/lib/types";

type Step = "select" | "preview";

export function ExportWizardDialog({
  open,
  onOpenChange,
  suppliers,
  defaultSupplierId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  suppliers: Supplier[];
  defaultSupplierId?: string;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("select");
  const [supplierId, setSupplierId] = useState(defaultSupplierId ?? "");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [currency, setCurrency] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: api.listProjects, enabled: open });

  useEffect(() => {
    if (open) {
      setStep("select");
      setSupplierId(defaultSupplierId ?? "");
      setSelected(new Set());
      setCurrency("");
      setError(null);
    }
  }, [open, defaultSupplierId]);

  const filteredProjects = useMemo(
    () => (projectsQuery.data ?? []).filter((p) => p.name.toLowerCase().includes(search.toLowerCase())),
    [projectsQuery.data, search],
  );

  const allSelected = filteredProjects.length > 0 && filteredProjects.every((p) => selected.has(p.id));

  const previewMutation = useMutation({
    mutationFn: () => api.previewExport({ supplierId, projectIds: Array.from(selected) }),
    onSuccess: () => setStep("preview"),
    onError: (e: Error) => setError(e.message),
  });

  const downloadMutation = useMutation({
    mutationFn: async () => {
      const { blob, filename } = await downloadExport({ supplierId, projectIds: Array.from(selected), currency: currency || undefined });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["export-history"] });
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const preview = previewMutation.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Выгрузить кроссировки в Excel</DialogTitle>
        </DialogHeader>

        {step === "select" && (
          <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
            <div className="flex flex-col gap-1.5">
              <Label>Поставщик</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите поставщика" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label>Модели автомобилей</Label>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() =>
                    setSelected((prev) => {
                      if (allSelected) {
                        const next = new Set(prev);
                        filteredProjects.forEach((p) => next.delete(p.id));
                        return next;
                      }
                      const next = new Set(prev);
                      filteredProjects.forEach((p) => next.add(p.id));
                      return next;
                    })
                  }
                >
                  {allSelected ? "Снять все" : "Выбрать все"}
                </button>
              </div>
              <Input placeholder="Поиск по названию…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8" />
              <div className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
                {filteredProjects.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                    <Checkbox
                      checked={selected.has(p.id)}
                      onCheckedChange={(c) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (c) next.add(p.id);
                          else next.delete(p.id);
                          return next;
                        })
                      }
                    />
                    {p.name}
                  </label>
                ))}
                {filteredProjects.length === 0 && <p className="py-2 text-center text-xs text-muted-foreground">Ничего не найдено</p>}
              </div>
              <p className="text-xs text-muted-foreground">Выбрано моделей: {selected.size}</p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
              <Button
                type="button"
                disabled={!supplierId || selected.size === 0 || previewMutation.isPending}
                onClick={() => {
                  setError(null);
                  previewMutation.mutate();
                }}
              >
                Проверить выборку
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "preview" && preview && (
          <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <Stat label="Моделей" value={preview.projectCount} />
              <Stat label="Комплектующих" value={preview.componentCount} />
              <Stat label="Строк в выгрузке" value={preview.uniqueRowCount} />
              <Stat label="Без цены" value={preview.noPriceCount} warn={preview.noPriceCount > 0} />
              <Stat label="Нет предложения" value={preview.noOfferCount} warn={preview.noOfferCount > 0} />
              <Stat label="Конфликты" value={preview.conflictCount} warn={preview.conflictCount > 0} />
            </div>

            {preview.isMixedCurrency && (
              <div className="rounded-md border border-[var(--status-waiting-fg)] bg-[var(--status-waiting-bg)] p-3 text-sm">
                <p className="mb-2 font-medium">В выборке несколько валют — выберите одну для выгрузки:</p>
                <div className="flex gap-2">
                  {Object.entries(preview.currencyBreakdown).map(([cur, count]) => (
                    <Button key={cur} type="button" size="sm" variant={currency === cur ? "default" : "outline"} onClick={() => setCurrency(cur)}>
                      {cur} ({count})
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {preview.conflicts.length > 0 && (
              <DiffBox title="Конфликты (не попадут в файл)" items={preview.conflicts.map((c) => `${c.ourArticle}: ${c.reason}`)} />
            )}
            {preview.noPriceComponents.length > 0 && (
              <DiffBox title="Без цены (не попадут в файл)" items={preview.noPriceComponents.map((c) => `${c.ourArticle} — ${c.componentName}`)} />
            )}
            {preview.noOfferComponents.length > 0 && (
              <DiffBox title="Нет предложения этого поставщика" items={preview.noOfferComponents.map((c) => `${c.ourArticle} — ${c.componentName}`)} />
            )}

            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/60">
                    <th className="px-2 py-1 text-left font-medium">Артикул поставщика</th>
                    <th className="px-2 py-1 text-left font-medium">Цена</th>
                    <th className="px-2 py-1 text-left font-medium">Наш артикул</th>
                    <th className="px-2 py-1 text-left font-medium">Наименование</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows
                    .filter((r) => !currency || r.currency === currency)
                    .map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-2 py-1">{r.supplierArticle}</td>
                        <td className="px-2 py-1 tabular">
                          {r.price} {r.currency}
                        </td>
                        <td className="px-2 py-1">{r.ourArticle}</td>
                        <td className="px-2 py-1">{r.componentName}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep("select")}>
                Назад
              </Button>
              <Button
                type="button"
                disabled={downloadMutation.isPending || (preview.isMixedCurrency && !currency)}
                onClick={() => {
                  setError(null);
                  downloadMutation.mutate();
                }}
              >
                Скачать Excel
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-md border border-border p-2">
      <div className={`tabular text-lg font-semibold ${warn ? "text-[var(--status-waiting-fg)]" : ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function DiffBox({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      <ul className="max-h-28 overflow-y-auto rounded-md border border-border p-2 text-xs">
        {items.slice(0, 50).map((t, i) => (
          <li key={i} className="py-0.5">
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}
