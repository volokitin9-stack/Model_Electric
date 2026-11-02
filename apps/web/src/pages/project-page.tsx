import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-badge";
import { ProjectFormDialog } from "@/components/project-form-dialog";
import { ProjectOverviewTab } from "@/components/project-overview-tab";
import { ProjectComponentsTab } from "@/components/project-components-tab";
import { ProjectSuppliersTab } from "@/components/project-suppliers-tab";
import { ProjectHistoryTab } from "@/components/project-history-tab";
import { api } from "@/lib/api";

function fmtDate(iso: string | null): string {
  if (!iso) return "не задана";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function StubTab({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      «{title}» будет реализовано в следующем этапе. Маршрут и вкладка уже готовы к подключению данных.
    </div>
  );
}

export function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const query = useQuery({ queryKey: ["project", id], queryFn: () => api.getProject(id!), enabled: Boolean(id) });
  const [tab, setTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);

  if (query.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Загрузка…</div>;
  }
  if (query.isError || !query.data) {
    return (
      <div className="flex flex-col gap-3 p-6 text-center">
        <p className="text-sm text-destructive">Проект не найден</p>
        <Link to="/" className="text-sm text-primary hover:underline">
          К списку проектов
        </Link>
      </div>
    );
  }

  const project = query.data;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-start gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <ArrowLeft className="h-4 w-4" /> Проекты
          </Link>
        </Button>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{project.name}</h1>
            <StatusBadge value={project.overallStatus} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Артикул: {project.article || "—"}</span>
            <span>Ответственный: {project.responsible || "—"}</span>
            <span>Плановая дата: {fmtDate(project.plannedDate)}</span>
          </div>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setEditOpen(true)}>
          <Pencil className="h-3.5 w-3.5" /> Редактировать
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Обзор</TabsTrigger>
          <TabsTrigger value="components">Комплектующие</TabsTrigger>
          <TabsTrigger value="suppliers">Поставщики</TabsTrigger>
          <TabsTrigger value="purchases">Закупки</TabsTrigger>
          <TabsTrigger value="schemes">Электросхемы</TabsTrigger>
          <TabsTrigger value="tooling">Оснастка</TabsTrigger>
          <TabsTrigger value="history">История</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <ProjectOverviewTab project={project} onViewComponents={() => setTab("components")} />
        </TabsContent>
        <TabsContent value="components">
          <ProjectComponentsTab projectId={project.id} />
        </TabsContent>
        <TabsContent value="suppliers">
          <ProjectSuppliersTab projectId={project.id} />
        </TabsContent>
        <TabsContent value="purchases">
          <StubTab title="Закупки" />
        </TabsContent>
        <TabsContent value="schemes">
          <StubTab title="Электросхемы" />
        </TabsContent>
        <TabsContent value="tooling">
          <StubTab title="Оснастка" />
        </TabsContent>
        <TabsContent value="history">
          <ProjectHistoryTab projectId={project.id} />
        </TabsContent>
      </Tabs>

      <ProjectFormDialog open={editOpen} onOpenChange={setEditOpen} project={project} />
    </div>
  );
}
