import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ProjectDrawing } from "@/lib/types";

// Статус P/N в спецификации чертежа (как в Excel) → цвет чипа.
const SPEC_STATUS_CLASS: Record<string, string> = {
  "Подтверждён": "bg-[var(--status-done-bg)] text-[var(--status-done-fg)]",
  "Вероятно": "bg-[var(--status-waiting-bg)] text-[var(--status-waiting-fg)]",
  "Проверить": "bg-[var(--status-problem-bg)] text-[var(--status-problem-fg)]",
};

function SpecStatus({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("status-chip", SPEC_STATUS_CLASS[value] ?? "bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)]")}>
      {value}
    </span>
  );
}

const dash = (v: string | null | undefined) => (v == null || v === "" ? "—" : v);

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function SheetFilter({ sheets, value, onChange }: { sheets: string[]; value: string; onChange: (v: string) => void }) {
  if (sheets.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {["all", ...sheets].map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={cn(
            "rounded-md border px-2.5 py-1 text-xs",
            value === s ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
          )}
        >
          {s === "all" ? "Все листы" : `Лист ${s}`}
        </button>
      ))}
    </div>
  );
}

function DrawingCard({ drawing }: { drawing: ProjectDrawing }) {
  const sheetNames = useMemo(() => drawing.sheets.map((s) => s.sheet), [drawing.sheets]);
  const [sheet, setSheet] = useState("all");
  const bySheet = <T extends { sheet: string }>(rows: T[]) => (sheet === "all" ? rows : rows.filter((r) => r.sheet === sheet));
  const connectors = bySheet(drawing.connectors);
  const pins = bySheet(drawing.pins);
  const pinIssues = drawing.pins.filter((p) => p.crossSectionCheck).length;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-base font-semibold">
          Чертёж №{drawing.drawingNo} · {drawing.brand} {drawing.model}
        </h2>
        <span className="text-xs text-muted-foreground">
          {drawing.sourceFile ?? "—"} · загружен {fmtDateTime(drawing.importedAt)}
        </span>
      </div>

      <ul className="flex flex-col gap-1 text-sm">
        {drawing.sheets.map((s) => (
          <li key={s.sheet}>
            <span className="font-medium">Лист {s.sheet}:</span> <span className="text-muted-foreground">{dash(s.description)}</span>
          </li>
        ))}
      </ul>

      <SheetFilter sheets={sheetNames} value={sheet} onChange={setSheet} />

      <Tabs defaultValue="connectors">
        <TabsList>
          <TabsTrigger value="connectors">Разъёмы ({connectors.length})</TabsTrigger>
          <TabsTrigger value="pins">
            Распиновка ({pins.length}){pinIssues > 0 ? ` · ⚠ ${pinIssues}` : ""}
          </TabsTrigger>
          <TabsTrigger value="notes">Замечания ({drawing.notes.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="connectors">
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Лист</TableHead>
                  <TableHead>Разъём</TableHead>
                  <TableHead>Поз. BOM</TableHead>
                  <TableHead>Назначение</TableHead>
                  <TableHead>P/N корпуса</TableHead>
                  <TableHead>Производитель</TableHead>
                  <TableHead>Позиций</TableHead>
                  <TableHead>Контакт</TableHead>
                  <TableHead>Шт</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Примечание</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connectors.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="whitespace-nowrap">{c.sheet}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{c.designator}</TableCell>
                    <TableCell>{dash(c.bomPosition)}</TableCell>
                    <TableCell className="min-w-48">{dash(c.purpose)}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{dash(c.housingPn)}</TableCell>
                    <TableCell>{dash(c.manufacturer)}</TableCell>
                    <TableCell>{dash(c.positions)}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{dash(c.contactPn)}</TableCell>
                    <TableCell>{dash(c.contactQty)}</TableCell>
                    <TableCell>
                      <SpecStatus value={c.status} />
                    </TableCell>
                    <TableCell className="min-w-48 text-muted-foreground">{dash(c.note)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="pins">
          <div className="max-h-[70vh] overflow-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Лист</TableHead>
                  <TableHead>Разъём</TableHead>
                  <TableHead>Пин</TableHead>
                  <TableHead>Провод</TableHead>
                  <TableHead>Цвет</TableHead>
                  <TableHead>мм²</TableHead>
                  <TableHead>Куда идёт</TableHead>
                  <TableHead>Контакт</TableHead>
                  <TableHead>Двойной обжим</TableHead>
                  <TableHead>Проверка сечения</TableHead>
                  <TableHead>Примечание</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pins.map((p) => (
                  <TableRow key={p.id} className={cn(p.crossSectionCheck && "bg-[var(--status-problem-bg)]/40")}>
                    <TableCell className="whitespace-nowrap">{p.sheet}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{p.connector}</TableCell>
                    <TableCell>{dash(p.pin)}</TableCell>
                    <TableCell className="whitespace-nowrap">{dash(p.wire)}</TableCell>
                    <TableCell>{dash(p.color)}</TableCell>
                    <TableCell>{dash(p.crossSection)}</TableCell>
                    <TableCell className="min-w-48">{dash(p.destination)}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{dash(p.contactPn)}</TableCell>
                    <TableCell>{p.doubleCrimp ? "Да" : ""}</TableCell>
                    <TableCell className="min-w-40 text-[var(--status-problem-fg)]">{p.crossSectionCheck ?? ""}</TableCell>
                    <TableCell className="min-w-40 text-muted-foreground">{p.note ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="notes">
          <ol className="flex flex-col gap-2">
            {drawing.notes.map((n) => (
              <li key={n.id} className="rounded-md border border-border px-3.5 py-2.5 text-sm">
                <div className="font-medium">
                  {n.number}. {dash(n.topic)}
                </div>
                <div className="mt-0.5">{n.text}</div>
                {n.recommendation && <div className="mt-1 text-muted-foreground">→ {n.recommendation}</div>}
              </li>
            ))}
          </ol>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function ProjectDrawingsTab({ projectId }: { projectId: string }) {
  const query = useQuery({ queryKey: ["drawings", projectId], queryFn: () => api.listProjectDrawings(projectId) });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  if (query.isError) return <p className="text-sm text-destructive">Не удалось загрузить чертежи</p>;
  if (!query.data?.length) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Чертежей пока нет. Их загружает Spec Import Agent из Excel-спецификаций (specs/Wiring_N) —
        см. apps/spec-import-agent/README.md.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {query.data.map((d) => (
        <DrawingCard key={d.id} drawing={d} />
      ))}
    </div>
  );
}
