import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { Component } from "@/lib/types";

export function AddProjectComponentDialog({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Component | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [internalArticle, setInternalArticle] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("шт");
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSearch("");
      setSelected(null);
      setCreatingNew(false);
      setInternalArticle("");
      setName("");
      setUnit("шт");
      setQuantity("1");
      setError(null);
    }
  }, [open]);

  const searchQuery = useQuery({
    queryKey: ["components-search", search],
    queryFn: () => api.listComponents(search || undefined),
    enabled: open && !creatingNew,
  });

  const mutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = { quantity: Number(quantity) || 1 };
      if (selected) payload.componentId = selected.id;
      else {
        payload.internalArticle = internalArticle.trim();
        payload.name = name.trim();
        payload.unit = unit.trim() || "шт";
      }
      return api.addProjectComponent(projectId, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-components", projectId] });
      qc.invalidateQueries({ queryKey: ["components"] });
      qc.invalidateQueries({ queryKey: ["project-summary", projectId] });
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected && (!internalArticle.trim() || !name.trim())) {
      setError("Выберите комплектующее из каталога или укажите артикул и название для нового");
      return;
    }
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Добавить в спецификацию</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {!creatingNew ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>Поиск в каталоге комплектующих</Label>
                <Input placeholder="Артикул или название…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
              </div>
              <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md border border-border p-1">
                {(searchQuery.data ?? []).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelected(c)}
                    className={`flex flex-col rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${selected?.id === c.id ? "bg-muted" : ""}`}
                  >
                    <span className="font-medium">{c.internalArticle}</span>
                    <span className="text-xs text-muted-foreground">{c.name}</span>
                  </button>
                ))}
                {(searchQuery.data ?? []).length === 0 && (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">Ничего не найдено в общем каталоге</p>
                )}
              </div>
              <Button type="button" variant="link" size="sm" className="self-start px-0" onClick={() => setCreatingNew(true)}>
                Нет в каталоге — создать новое комплектующее
              </Button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="internalArticle">Внутренний артикул</Label>
                  <Input id="internalArticle" value={internalArticle} onChange={(e) => setInternalArticle(e.target.value)} autoFocus />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="unit">Единица</Label>
                  <Input id="unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
                </div>
                <div className="col-span-2 flex flex-col gap-1.5">
                  <Label htmlFor="name">Наименование</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Совпадающий по артикулу комплектующий будет переиспользован автоматически — дублей в общем каталоге не создаётся.
              </p>
              <Button type="button" variant="link" size="sm" className="self-start px-0" onClick={() => setCreatingNew(false)}>
                Вернуться к поиску по каталогу
              </Button>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quantity">Количество</Label>
            <Input id="quantity" type="number" min="0.001" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-32" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              Добавить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
