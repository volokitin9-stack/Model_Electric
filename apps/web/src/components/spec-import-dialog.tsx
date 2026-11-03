import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { SpecImportReport } from "@/lib/types";

// Сервер сам запускает apps/spec-import-agent дочерним процессом (см.
// src/specImport.ts на сервере) — сначала показываем план (apply:false),
// запись в базу — только после явного подтверждения.
export function SpecImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [report, setReport] = useState<SpecImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const previewMutation = useMutation({
    mutationFn: () => api.runSpecImport(false),
    onSuccess: (r) => setReport(r),
    onError: (e: Error) => setError(e.message),
  });

  const applyMutation = useMutation({
    mutationFn: () => api.runSpecImport(true),
    onSuccess: (r) => {
      setReport(r);
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["components"] });
      qc.invalidateQueries({ queryKey: ["cross-references"] });
      qc.invalidateQueries({ queryKey: ["changelog"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  useEffect(() => {
    if (open) {
      setReport(null);
      setError(null);
      previewMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const busy = previewMutation.isPending || applyMutation.isPending;
  const applied = report?.apply === true;

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Обновить данные из чертежей</DialogTitle>
        </DialogHeader>

        <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
          {previewMutation.isPending && (
            <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Читаю чертежи и сверяю с базой…
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {report && (
            <>
              <div className="grid grid-cols-3 gap-2 text-sm sm:grid-cols-5">
                <Stat label="Проектов создано" value={report.totals.projectsCreated} />
                <Stat label="Каталог +" value={report.totals.catalogCreated} />
                <Stat label="Спецификация +" value={report.totals.added} />
                <Stat label="Чертежей" value={report.totals.drawings} />
                <Stat label="Ошибок" value={report.totals.errors} warn={report.totals.errors > 0} />
              </div>

              <div className="flex flex-col gap-2">
                {report.drawings.map((d) => (
                  <div key={d.drawingNo} className="rounded-md border border-border p-2.5 text-xs">
                    <div className="mb-1 font-medium">
                      №{d.drawingNo} {d.project?.name ?? "?"}
                    </div>
                    {d.actions.map((a, i) => (
                      <div key={i} className="text-muted-foreground">
                        {a}
                      </div>
                    ))}
                    {d.errors.map((e, i) => (
                      <div key={i} className="text-destructive">
                        ✖ {e}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {applied ? (
                <p className="rounded-md border border-[var(--status-done-fg)] bg-[var(--status-done-bg)] p-3 text-sm">
                  Данные записаны в базу.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Это только план — в базе пока ничего не менялось. Нажмите «Применить», чтобы записать.
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {applied ? "Закрыть" : "Отмена"}
          </Button>
          {report && !applied && (
            <Button type="button" onClick={() => applyMutation.mutate()} disabled={busy}>
              {applyMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Применяю…
                </>
              ) : (
                "Применить"
              )}
            </Button>
          )}
        </DialogFooter>
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
