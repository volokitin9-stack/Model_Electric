import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { api } from "@/lib/api";

// Полноценная страница проекта — следующий этап (см. ТЗ, п. "Границы
// текущего этапа"). Сейчас — минимальная заглушка с названием и
// возвратом к списку, маршрут /projects/:id уже рабочий.
export function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const query = useQuery({ queryKey: ["project", id], queryFn: () => api.getProject(id!), enabled: Boolean(id) });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-10 text-center">
      <Button variant="outline" asChild className="mx-auto">
        <Link to="/">
          <ArrowLeft className="h-4 w-4" /> К списку проектов
        </Link>
      </Button>

      {query.isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
      {query.isError && <p className="text-sm text-destructive">Проект не найден</p>}
      {query.data && (
        <>
          <h1 className="text-xl font-semibold">{query.data.name}</h1>
          <div className="flex items-center justify-center gap-2">
            <StatusBadge value={query.data.overallStatus} />
            <span className="text-sm text-muted-foreground">Прогресс {query.data.progress}%</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Полноценная страница проекта (детальная разработка схемы, артикулы разъёмов, оформление заказов) —
            следующий этап. Пока используйте боковую панель на дашборде для просмотра и редактирования.
          </p>
        </>
      )}
    </div>
  );
}
