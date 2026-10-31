import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CrossReferenceTable } from "@/components/cross-reference-table";
import { PriceEditDialog } from "@/components/price-edit-dialog";
import { api } from "@/lib/api";
import type { CrossReference } from "@/lib/types";

export function ProjectSuppliersTab({ projectId }: { projectId: string }) {
  const componentsQuery = useQuery({ queryKey: ["project-components", projectId], queryFn: () => api.listProjectComponents(projectId) });
  const crossRefsQuery = useQuery({ queryKey: ["cross-references"], queryFn: api.listCrossReferences });
  const [priceEditing, setPriceEditing] = useState<CrossReference | null>(null);

  const componentIds = useMemo(() => new Set((componentsQuery.data ?? []).map((c) => c.componentId)), [componentsQuery.data]);
  const filtered = useMemo(
    () => (crossRefsQuery.data ?? []).filter((r) => r.component && componentIds.has(r.component.id)),
    [crossRefsQuery.data, componentIds],
  );

  if (componentsQuery.isLoading || crossRefsQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  if ((componentsQuery.data ?? []).length === 0) {
    return <p className="text-sm text-muted-foreground">В спецификации проекта пока нет комплектующих — добавьте их на вкладке «Комплектующие».</p>;
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <CrossReferenceTable data={filtered} onEditPrice={setPriceEditing} storageKey="project-suppliers" />
      <PriceEditDialog crossReference={priceEditing} onOpenChange={(v) => !v && setPriceEditing(null)} />
    </div>
  );
}
