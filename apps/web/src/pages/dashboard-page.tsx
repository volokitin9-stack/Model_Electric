import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, ScrollText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { KpiCards } from "@/components/kpi-cards";
import { ProjectsTable } from "@/components/projects-table";
import { ProjectFormDialog } from "@/components/project-form-dialog";
import { ProjectSidePanel } from "@/components/project-side-panel";
import { api } from "@/lib/api";
import { computeKpis, matchesKpi, type KpiKey } from "@/lib/kpi";
import type { Project } from "@/lib/types";

export function DashboardPage() {
  const qc = useQueryClient();
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });

  const [search, setSearch] = useState("");
  const [activeKpi, setActiveKpi] = useState<KpiKey | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [panelProject, setPanelProject] = useState<Project | null>(null);

  const data = projectsQuery.data ?? [];
  const kpiCounts = useMemo(() => computeKpis(data), [data]);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const externalFilter = useCallback(
    (p: Project) => (activeKpi ? matchesKpi(p, activeKpi, today) : true),
    [activeKpi, today],
  );

  const updateMutation = useMutation({
    mutationFn: ({ id, field, value }: { id: string; field: string; value: string }) =>
      api.updateProject(id, { [field]: value } as Partial<Project>),
    onSuccess: (updated) => {
      qc.setQueryData<Project[]>(["projects"], (prev) => prev?.map((p) => (p.id === updated.id ? updated : p)));
      qc.invalidateQueries({ queryKey: ["changelog"] });
      if (panelProject && panelProject.id === updated.id) setPanelProject(updated);
    },
  });

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Дашборд проектов</h1>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию, артикулу, ответственному…"
            className="h-9 pl-8"
          />
        </div>
        <Button variant="outline" asChild>
          <Link to="/journal">
            <ScrollText className="h-4 w-4" /> Журнал
          </Link>
        </Button>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Создать проект
        </Button>
      </div>

      <KpiCards counts={kpiCounts} active={activeKpi} onToggle={(key) => setActiveKpi((prev) => (prev === key ? null : key))} />

      {projectsQuery.isLoading && <div className="py-10 text-center text-sm text-muted-foreground">Загрузка проектов…</div>}
      {projectsQuery.isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Не удалось загрузить проекты. Проверьте, что запущен сервер API (apps/server).
        </div>
      )}

      {projectsQuery.isSuccess && (
        <ProjectsTable
          data={data}
          globalFilter={search}
          externalFilter={externalFilter}
          onUpdateField={(id, field, value) => updateMutation.mutate({ id, field, value })}
          onOpenSidePanel={setPanelProject}
        />
      )}

      <ProjectFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ProjectSidePanel project={panelProject} onOpenChange={(v) => !v && setPanelProject(null)} />
    </div>
  );
}
