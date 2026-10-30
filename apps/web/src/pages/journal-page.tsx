import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function JournalPage() {
  const query = useQuery({ queryKey: ["changelog", "global"], queryFn: () => api.changelog(200) });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link to="/">
            <ArrowLeft className="h-4 w-4" /> Дашборд
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">Журнал изменений</h1>
      </div>

      {query.isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
      {query.data?.length === 0 && <p className="text-sm text-muted-foreground">Изменений пока нет.</p>}

      <div className="flex flex-col gap-2">
        {query.data?.map((entry) => (
          <div key={entry.id} className="rounded-md border border-border bg-card px-3.5 py-2.5 text-sm">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <Link to={`/projects/${entry.projectId}`} className="font-medium text-primary hover:underline">
                {entry.project?.name ?? entry.projectId}
              </Link>
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
    </div>
  );
}
