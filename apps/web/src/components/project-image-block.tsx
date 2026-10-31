import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageOff, Trash2, Upload, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { api } from "@/lib/api";

export function ProjectImageBlock({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({ queryKey: ["project-images", projectId], queryFn: () => api.listProjectImages(projectId) });
  const current = query.data?.[0] ?? null;

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.uploadProjectImage(projectId, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-images", projectId] }),
    onError: (e: Error) => setError(e.message),
  });

  const replaceMutation = useMutation({
    mutationFn: async (file: File) => {
      if (current) await api.deleteProjectImage(projectId, current.id);
      return api.uploadProjectImage(projectId, file);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-images", projectId] }),
    onError: (e: Error) => setError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteProjectImage(projectId, current!.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-images", projectId] }),
    onError: (e: Error) => setError(e.message),
  });

  function pickFile(mode: "upload" | "replace") {
    setError(null);
    const input = inputRef.current!;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (mode === "upload") uploadMutation.mutate(file);
      else replaceMutation.mutate(file);
      input.value = "";
    };
    input.click();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Фото комплекта</div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" />
      <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
        {current ? (
          <>
            <button type="button" className="h-full w-full" onClick={() => setZoomOpen(true)}>
              <img src={current.imagePath} alt="Фото комплекта" className="h-full w-full object-cover" />
            </button>
            <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/50 to-transparent p-2">
              <Button variant="secondary" size="icon" className="h-7 w-7" onClick={() => setZoomOpen(true)} title="Увеличить">
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button variant="secondary" size="icon" className="h-7 w-7" onClick={() => pickFile("replace")} title="Заменить">
                <Upload className="h-3.5 w-3.5" />
              </Button>
              <Button variant="destructive" size="icon" className="h-7 w-7" onClick={() => deleteMutation.mutate()} title="Удалить">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <ImageOff className="h-8 w-8" />
            <span className="text-xs">Фото не загружено</span>
            <Button size="sm" variant="outline" onClick={() => pickFile("upload")} disabled={uploadMutation.isPending}>
              <Upload className="h-3.5 w-3.5" /> Загрузить
            </Button>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}

      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="max-w-3xl">
          {current && <img src={current.imagePath} alt="Фото комплекта" className="max-h-[80vh] w-full object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
