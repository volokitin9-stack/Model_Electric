import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

// "Забиваю артикул разъёма/пина — база показывает, откуда он" — поиск
// по housingPn/contactPn среди всех чертежей, с привязкой к общему
// каталогу комплектующих (см. apps/server/src/routes/drawings.ts).
// Один и тот же разъём в разных моделях — одна запись каталога, искать
// цену/поставщика заново для каждой модели не нужно.
export function ConnectorSearchPage() {
  const [query, setQuery] = useState("");
  const mutation = useMutation({
    mutationFn: (article: string) => api.searchConnectors(article),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q) mutation.mutate(q);
  }

  const data = mutation.data;

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-4 py-4 sm:px-6">
      <h1 className="text-lg font-semibold">Поиск разъёмов и пинов</h1>
      <p className="text-sm text-muted-foreground">
        Введите артикул корпуса разъёма или контакта — покажет, в каких моделях (чертежах) он встречается, и
        связанный элемент общего каталога комплектующих, если такой есть.
      </p>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Например: 1-929627-1"
            className="h-9 pl-8"
            autoFocus
          />
        </div>
        <Button type="submit" disabled={!query.trim() || mutation.isPending}>
          {mutation.isPending ? "Ищу…" : "Найти"}
        </Button>
      </form>

      {mutation.isError && <p className="text-sm text-destructive">{(mutation.error as Error).message}</p>}

      {data && (
        <div className="flex flex-col gap-4">
          {data.component ? (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">В общем каталоге комплектующих</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-semibold">{data.component.internalArticle}</span>
                <span className="text-sm text-muted-foreground">{data.component.name}</span>
              </div>
              {data.component.category && <div className="mt-1 text-xs text-muted-foreground">{data.component.category.name}</div>}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
              В общем каталоге комплектующих точного совпадения нет — показаны только прямые совпадения по чертежам ниже.
            </p>
          )}

          {data.componentMatches.length > 1 && (
            <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
              Похожие артикулы в каталоге: {data.componentMatches.map((c) => c.internalArticle).join(", ")}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Встречается в {data.results.length} {data.results.length === 1 ? "модели" : "моделях"}
            </div>
            {data.results.length === 0 && (
              <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                Ничего не найдено ни в одном чертеже.
              </p>
            )}
            {data.results.map((r) => (
              <div key={`${r.projectId}-${r.drawingNo}`} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center justify-between">
                  <Link to={`/projects/${r.projectId}`} className="text-sm font-medium text-primary hover:underline">
                    {r.projectName}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    Чертёж №{r.drawingNo} ({r.brand} {r.model})
                  </span>
                </div>
                {r.connectors.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1 text-xs">
                    {r.connectors.map((c, i) => (
                      <div key={i} className="text-muted-foreground">
                        Разъём {c.designator} (лист {c.sheet}){c.manufacturer ? ` — ${c.manufacturer}` : ""}
                        {c.positions ? `, ${c.positions} поз.` : ""}
                      </div>
                    ))}
                  </div>
                )}
                {r.pins.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1 text-xs">
                    {r.pins.map((p, i) => (
                      <div key={i} className="text-muted-foreground">
                        Пин {p.pin ?? "—"} в {p.connector} (лист {p.sheet}){p.wire ? `, провод ${p.wire}` : ""}
                        {p.color ? ` ${p.color}` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
