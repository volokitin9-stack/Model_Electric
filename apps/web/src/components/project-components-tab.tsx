import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusSelect } from "@/components/status-select";
import { AddProjectComponentDialog } from "@/components/add-project-component-dialog";
import { api } from "@/lib/api";
import { COMPONENT_STATUSES } from "@/lib/statuses";
import type { CrossReference, ProjectComponent } from "@/lib/types";

export function ProjectComponentsTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const componentsQuery = useQuery({ queryKey: ["project-components", projectId], queryFn: () => api.listProjectComponents(projectId) });
  const crossRefsQuery = useQuery({ queryKey: ["cross-references"], queryFn: api.listCrossReferences });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => api.updateProjectComponent(projectId, id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-components", projectId] });
      qc.invalidateQueries({ queryKey: ["project-summary", projectId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteProjectComponent(projectId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-components", projectId] });
      qc.invalidateQueries({ queryKey: ["project-summary", projectId] });
    },
  });

  function offersFor(componentId: string): CrossReference[] {
    return (crossRefsQuery.data ?? []).filter((r) => r.component?.id === componentId && r.status === "active");
  }

  function formatCost(pc: ProjectComponent): string {
    if (pc.cost.amount == null) return "цена не определена";
    const label = pc.cost.source === "planned" ? " (плановая)" : "";
    return `${pc.cost.amount} ${pc.cost.currency ?? ""}${label}`;
  }

  const rows = componentsQuery.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Позиций в спецификации: {rows.length}</p>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Добавить комплектующее
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-xs uppercase text-muted-foreground">
              <th className="px-3 py-2 text-left">Артикул</th>
              <th className="px-3 py-2 text-left">Наименование</th>
              <th className="px-3 py-2 text-left">Кол-во</th>
              <th className="px-3 py-2 text-left">Статус</th>
              <th className="px-3 py-2 text-left">Предложение поставщика</th>
              <th className="px-3 py-2 text-left">Цена / сумма</th>
              <th className="px-3 py-2 text-left">Комментарий</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((pc) => {
              const offers = offersFor(pc.componentId);
              return (
                <tr key={pc.id} className="border-b border-border align-top">
                  <td className="px-3 py-2 font-medium">{pc.component.internalArticle}</td>
                  <td className="px-3 py-2">{pc.component.name}</td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min="0.001"
                      step="0.001"
                      defaultValue={pc.quantity}
                      className="h-7 w-20 text-xs"
                      onBlur={(e) => {
                        const n = Number(e.target.value);
                        if (n > 0 && String(n) !== pc.quantity) updateMutation.mutate({ id: pc.id, data: { quantity: n } });
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <StatusSelect
                      value={pc.status}
                      options={COMPONENT_STATUSES}
                      onChange={(v) => updateMutation.mutate({ id: pc.id, data: { status: v } })}
                      className="w-40"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={pc.primaryOfferId ?? "__none"}
                      onValueChange={(v) => updateMutation.mutate({ id: pc.id, data: { primaryOfferId: v === "__none" ? null : v } })}
                    >
                      <SelectTrigger className="h-7 w-56 text-xs">
                        <SelectValue placeholder="Не выбрано" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Не выбрано</SelectItem>
                        {offers.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.supplier?.code} — {o.supplierArticle}
                            {o.currentPrice ? ` (${o.currentPrice.price} ${o.currentPrice.currency})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {offers.length === 0 && <p className="mt-1 text-[11px] text-muted-foreground">Нет активных предложений</p>}
                  </td>
                  <td className="px-3 py-2 tabular whitespace-nowrap">
                    {formatCost(pc)}
                    {pc.lineTotal && <div className="text-xs text-muted-foreground">итого: {pc.lineTotal}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      defaultValue={pc.comment ?? ""}
                      className="h-7 w-32 text-xs"
                      onBlur={(e) => {
                        if (e.target.value !== (pc.comment ?? "")) updateMutation.mutate({ id: pc.id, data: { comment: e.target.value || null } });
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMutation.mutate(pc.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  Спецификация пока пуста.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AddProjectComponentDialog open={addOpen} onOpenChange={setAddOpen} projectId={projectId} />
    </div>
  );
}
