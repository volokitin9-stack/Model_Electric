import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ProjectHistoryTab({ projectId }: { projectId: string }) {
  const query = useQuery({ queryKey: ["changelog", projectId], queryFn: () => api.projectChangelog(projectId) });

  return (
    <div className="flex flex-col gap-2">
      {query.isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
      {query.data?.length === 0 && <p className="text-sm text-muted-foreground">Изменений пока нет.</p>}
      {query.data?.map((entry) => (
        <div key={entry.id} className="rounded-md border border-border bg-card px-3.5 py-2.5 text-sm">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{entry.changedBy}</span>
            <span>{fmtDateTime(entry.changedAt)}</span>
          </div>
          <div className="mt-1">
            <span className="text-muted-foreground">{entry.fieldLabel}: </span>
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
  );
}
