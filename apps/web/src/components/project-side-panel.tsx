import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ExternalLink, Pencil } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/status-badge";
import { ProjectFormDialog } from "@/components/project-form-dialog";
import { api } from "@/lib/api";
import { PROCESS_FIELDS, PROCESS_LABELS } from "@/lib/statuses";
import type { Project } from "@/lib/types";

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function ProjectSidePanel({
  project,
  onOpenChange,
}: {
  project: Project | null;
  onOpenChange: (v: boolean) => void;
}) {
  const [editOpen, setEditOpen] = useState(false);

  const changelog = useQuery({
    queryKey: ["changelog", "project", project?.id],
    queryFn: () => api.projectChangelog(project!.id),
    enabled: Boolean(project),
  });

  return (
    <>
      <Sheet open={Boolean(project)} onOpenChange={onOpenChange}>
        <SheetContent widthClassName="w-full sm:max-w-lg">
          {project && (
            <>
              <SheetHeader>
                <SheetTitle className="pr-8">{project.name}</SheetTitle>
                <div className="mt-1 flex items-center gap-2">
                  <StatusBadge value={project.overallStatus} />
                  <span className="text-xs text-muted-foreground">
                    Прогресс {project.progress}% · {project.nextAction}
                  </span>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div className="text-muted-foreground">Артикул</div>
                    <div>{project.article || "—"}</div>
                    <div className="text-muted-foreground">Ответственный</div>
                    <div>{project.responsible || "—"}</div>
                    <div className="text-muted-foreground">Плановая дата</div>
                    <div>{fmtDate(project.plannedDate)}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                    <Pencil className="h-3.5 w-3.5" /> Изменить
                  </Button>
                </div>

                <Separator className="my-4" />

                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Статусы процессов</div>
                <div className="flex flex-col gap-1.5">
                  {PROCESS_FIELDS.map((f) => (
                    <div key={f} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">{PROCESS_LABELS[f]}</span>
                      <StatusBadge value={project[f]} />
                    </div>
                  ))}
                </div>

                <Separator className="my-4" />

                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">История изменений</div>
                </div>
                <div className="flex flex-col gap-2.5">
                  {changelog.isLoading && <div className="text-xs text-muted-foreground">Загрузка…</div>}
                  {changelog.data?.length === 0 && <div className="text-xs text-muted-foreground">Изменений пока нет</div>}
                  {changelog.data?.map((entry) => (
                    <div key={entry.id} className="rounded-md border border-border px-3 py-2 text-xs">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>{entry.fieldLabel}</span>
                        <span>{fmtDateTime(entry.changedAt)}</span>
                      </div>
                      <div className="mt-1">
                        {entry.oldValue ? (
                          <>
                            <span className="text-muted-foreground line-through">{entry.oldValue}</span>
                            {" → "}
                          </>
                        ) : null}
                        <span className="font-medium">{entry.newValue ?? "—"}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <Separator className="my-4" />
                <Link to={`/projects/${project.id}`} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                  Открыть страницу проекта <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {project && <ProjectFormDialog open={editOpen} onOpenChange={setEditOpen} project={project} />}
    </>
  );
}
