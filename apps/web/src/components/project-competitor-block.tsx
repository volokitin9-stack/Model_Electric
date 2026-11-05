import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { ProjectCompetitor } from "@/lib/types";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

type FormState = { sellerName: string; productName: string; productUrl: string; price: string; currency: string; comment: string };
function toForm(c?: ProjectCompetitor | null): FormState {
  return {
    sellerName: c?.sellerName ?? "",
    productName: c?.productName ?? "",
    productUrl: c?.productUrl ?? "",
    price: c?.price ?? "",
    currency: c?.currency ?? "RUB",
    comment: c?.comment ?? "",
  };
}

// Место в топе Ozon, которое проставляет spec-import-agent (комментарий «Ozon #N: …»);
// записи, добавленные вручную, идут первыми.
function ozonRank(c: ProjectCompetitor): number {
  const m = /^Ozon #(\d+):/.exec(c.comment ?? "");
  return m ? Number(m[1]) : 0;
}

export function ProjectCompetitorBlock({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(toForm());
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<ProjectCompetitor | null>(null);

  const query = useQuery({ queryKey: ["project-competitors", projectId], queryFn: () => api.listProjectCompetitors(projectId) });
  const list = [...(query.data ?? [])].sort((a, b) => ozonRank(a) - ozonRank(b));

  function openForm(c: ProjectCompetitor | null) {
    setCurrent(c);
    setFormOpen(true);
  }

  useEffect(() => {
    if (formOpen) {
      setForm(toForm(current));
      setError(null);
    }
  }, [formOpen, current]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        sellerName: form.sellerName.trim(),
        productName: form.productName.trim(),
        productUrl: form.productUrl.trim() || null,
        price: form.price ? Number(form.price) : null,
        currency: form.currency.trim() || null,
        comment: form.comment.trim() || null,
      };
      return current ? api.updateProjectCompetitor(projectId, current.id, payload) : api.createProjectCompetitor(projectId, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-competitors", projectId] });
      setFormOpen(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.sellerName.trim() || !form.productName.trim()) {
      setError("Укажите продавца и товар");
      return;
    }
    saveMutation.mutate();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Топ-продавцы Ozon{list.length > 1 ? ` (${list.length})` : ""}
        </div>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openForm(null)}>
          <Plus className="h-3 w-3" /> Добавить
        </Button>
      </div>

      {list.length > 0 ? (
        list.map((c) => (
          <div key={c.id} className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                {ozonRank(c) > 0 && <span className="mr-1 text-muted-foreground">#{ozonRank(c)}</span>}
                {c.sellerName}
              </span>
              <span className="flex items-center gap-1">
                {c.price && (
                  <span className="tabular font-semibold">
                    {c.price} {c.currency}
                  </span>
                )}
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openForm(c)} aria-label="Изменить">
                  <Pencil className="h-3 w-3" />
                </Button>
              </span>
            </div>
            <div className="text-muted-foreground">{c.productName}</div>
            {c.comment && <div className="text-xs text-muted-foreground">{c.comment.replace(/^Ozon #\d+:\s*/, "")}</div>}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Проверено: {fmtDate(c.checkedAt)}</span>
              {c.productUrl && (
                <a href={c.productUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  Открыть на Ozon <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        ))
      ) : (
        <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          Нет данных о конкурентах на Ozon — добавьте вручную.
        </p>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{current ? "Продавец на Ozon" : "Новый продавец на Ozon"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sellerName">Продавец</Label>
                <Input id="sellerName" value={form.sellerName} onChange={(e) => setForm({ ...form, sellerName: e.target.value })} autoFocus />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="productName">Товар</Label>
                <Input id="productName" value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="productUrl">Ссылка на Ozon</Label>
                <Input id="productUrl" value={form.productUrl} onChange={(e) => setForm({ ...form, productUrl: e.target.value })} placeholder="https://www.ozon.ru/product/..." />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="price">Цена</Label>
                <Input id="price" type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="currency">Валюта</Label>
                <Input id="currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="comment">Комментарий</Label>
                <Input id="comment" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                Сохранить
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
