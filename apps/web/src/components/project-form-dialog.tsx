import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import {
  OVERALL_STATUSES,
  OVERALL_STATUS_LABELS,
  PROCESS_FIELDS,
  PROCESS_LABELS,
  PROCESS_OPTIONS,
  STATUS_LABELS,
} from "@/lib/statuses";
import type { Project, ProjectInput } from "@/lib/types";

type FormState = {
  name: string;
  article: string;
  responsible: string;
  overallStatus: string;
  plannedDate: string;
} & Record<(typeof PROCESS_FIELDS)[number], string>;

function emptyForm(): FormState {
  const base = {
    name: "",
    article: "",
    responsible: "",
    overallStatus: "active",
    plannedDate: "",
  } as FormState;
  for (const f of PROCESS_FIELDS) base[f] = "not_started";
  return base;
}

function toForm(project: Project): FormState {
  const base = {
    name: project.name,
    article: project.article ?? "",
    responsible: project.responsible ?? "",
    overallStatus: project.overallStatus,
    plannedDate: project.plannedDate ? project.plannedDate.slice(0, 10) : "",
  } as FormState;
  for (const f of PROCESS_FIELDS) base[f] = project[f];
  return base;
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Если передан — редактирование, иначе создание нового проекта. */
  project?: Project | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(project ? toForm(project) : emptyForm());
      setError(null);
    }
  }, [open, project]);

  const createMutation = useMutation({
    mutationFn: (data: ProjectInput) => api.createProject(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<ProjectInput>) => api.updateProject(project!.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project", project?.id] });
      qc.invalidateQueries({ queryKey: ["changelog"] });
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Укажите название проекта");
      return;
    }
    const payload: ProjectInput = {
      name: form.name.trim(),
      article: form.article.trim() || null,
      responsible: form.responsible.trim() || null,
      overallStatus: form.overallStatus as Project["overallStatus"],
      plannedDate: form.plannedDate || null,
    };
    for (const f of PROCESS_FIELDS) payload[f] = form[f];

    if (project) updateMutation.mutate(payload);
    else createMutation.mutate(payload);
  }

  const pending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{project ? "Редактирование проекта" : "Новый проект"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="name">Название проекта</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="article">Артикул</Label>
              <Input id="article" value={form.article} onChange={(e) => setForm({ ...form, article: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="responsible">Ответственный</Label>
              <Input id="responsible" value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Общий статус</Label>
              <Select value={form.overallStatus} onValueChange={(v) => setForm({ ...form, overallStatus: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OVERALL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {OVERALL_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="plannedDate">Плановая дата завершения</Label>
              <Input
                id="plannedDate"
                type="date"
                value={form.plannedDate}
                onChange={(e) => setForm({ ...form, plannedDate: e.target.value })}
              />
            </div>
          </div>

          <div className="rounded-md border border-border p-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Статусы процессов</div>
            <div className="grid grid-cols-2 gap-3">
              {PROCESS_FIELDS.map((f) => (
                <div key={f} className="flex flex-col gap-1.5">
                  <Label>{PROCESS_LABELS[f]}</Label>
                  <Select value={form[f]} onValueChange={(v) => setForm({ ...form, [f]: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROCESS_OPTIONS[f].map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {STATUS_LABELS[opt] ?? opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              {project ? "Сохранить" : "Создать проект"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
