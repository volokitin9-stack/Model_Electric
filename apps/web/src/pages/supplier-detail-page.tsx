import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, Pencil, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CrossReferenceTable } from "@/components/cross-reference-table";
import { PriceEditDialog } from "@/components/price-edit-dialog";
import { SupplierFormDialog } from "@/components/supplier-form-dialog";
import { ImportWizardDialog } from "@/components/import-wizard-dialog";
import { ExportWizardDialog } from "@/components/export-wizard-dialog";
import { api } from "@/lib/api";
import type { CrossReference } from "@/lib/types";

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useQuery({ queryKey: ["supplier", id], queryFn: () => api.getSupplier(id!), enabled: !!id });

  const [editOpen, setEditOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [priceEditing, setPriceEditing] = useState<CrossReference | null>(null);

  if (query.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Загрузка…</div>;
  }
  if (query.isError || !query.data) {
    return (
      <div className="flex flex-col gap-3 p-6">
        <p className="text-sm text-destructive">Поставщик не найден.</p>
        <Link to="/suppliers" className="text-sm text-primary hover:underline">
          Назад к списку поставщиков
        </Link>
      </div>
    );
  }

  const s = query.data;
  const pricedCount = s.crossReferences.filter((r) => r.currentPrice).length;
  const lastPriceChangeAt = s.crossReferences
    .map((r) => r.currentPrice?.effectiveAt)
    .filter(Boolean)
    .reduce((a, b) => ((a ?? "") > (b ?? "") ? a : b), null as string | null | undefined);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/suppliers">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-3.5 w-3.5" /> Поставщики
          </Button>
        </Link>
        <div className="flex flex-col">
          <h1 className="text-lg font-semibold">
            {s.code} — {s.name}
          </h1>
          <span className="text-xs text-muted-foreground">{s.country || "Страна не указана"}</span>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" /> Редактировать
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-3.5 w-3.5" /> Загрузить файл
          </Button>
          <Button size="sm" onClick={() => setExportOpen(true)}>
            <Download className="h-3.5 w-3.5" /> Выгрузить Excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-4">
        <InfoField label="Контактное лицо" value={s.contactPerson} />
        <InfoField label="Телефон" value={s.phone} />
        <InfoField label="Email" value={s.email} />
        <InfoField label="Мессенджер" value={s.messenger} />
        <InfoField label="Сайт" value={s.website} />
        <InfoField label="Валюта по умолчанию" value={s.defaultCurrency} />
        <InfoField label="Комментарий" value={s.comment} />
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <KpiTile label="Кроссировок" value={s.crossReferences.length} />
        <KpiTile label="С ценой" value={pricedCount} />
        <KpiTile label="Последняя загрузка" value={fmtDateTime(s.lastImportAt)} isText />
        <KpiTile label="Последнее изменение цены" value={fmtDateTime(lastPriceChangeAt)} isText />
      </div>

      <Tabs defaultValue="cross-refs">
        <TabsList>
          <TabsTrigger value="cross-refs">Кроссировки</TabsTrigger>
          <TabsTrigger value="profiles">Прайс-листы</TabsTrigger>
          <TabsTrigger value="batches">История загрузок</TabsTrigger>
          <TabsTrigger value="exports">Выгрузки</TabsTrigger>
          <TabsTrigger value="projects">Проекты</TabsTrigger>
        </TabsList>

        <TabsContent value="cross-refs">
          <div className="rounded-lg border border-border bg-card p-4">
            <CrossReferenceTable data={s.crossReferences} onEditPrice={setPriceEditing} storageKey="supplier-detail" />
          </div>
        </TabsContent>

        <TabsContent value="profiles">
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60 text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">Шаблон</th>
                  <th className="px-3 py-2 text-left">Формат</th>
                  <th className="px-3 py-2 text-left">Лист</th>
                  <th className="px-3 py-2 text-left">Строка заголовка</th>
                  <th className="px-3 py-2 text-left">Строка данных с</th>
                  <th className="px-3 py-2 text-left">Код папки агента</th>
                </tr>
              </thead>
              <tbody>
                {s.importProfiles.map((p) => (
                  <tr key={p.id} className="border-b border-border">
                    <td className="px-3 py-2">{p.profileName}</td>
                    <td className="px-3 py-2 uppercase">{p.fileType}</td>
                    <td className="px-3 py-2">{p.sheetName || "—"}</td>
                    <td className="px-3 py-2 tabular">{p.headerRow}</td>
                    <td className="px-3 py-2 tabular">{p.dataStartRow}</td>
                    <td className="px-3 py-2">{p.localSourceKey || "—"}</td>
                  </tr>
                ))}
                {s.importProfiles.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                      Шаблонов импорта пока нет.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="batches">
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60 text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">Дата</th>
                  <th className="px-3 py-2 text-left">Файл</th>
                  <th className="px-3 py-2 text-left">Статус</th>
                  <th className="px-3 py-2 text-left">Создано</th>
                  <th className="px-3 py-2 text-left">Обновлено</th>
                  <th className="px-3 py-2 text-left">Отклонено</th>
                </tr>
              </thead>
              <tbody>
                {s.importBatches.map((b) => (
                  <tr key={b.id} className="border-b border-border">
                    <td className="px-3 py-2">{fmtDateTime(b.importedAt)}</td>
                    <td className="px-3 py-2">{b.sourceFile}</td>
                    <td className="px-3 py-2">{b.status === "applied" ? "Применено" : b.status === "previewed" ? "Предпросмотр" : b.status}</td>
                    <td className="px-3 py-2 tabular">{b.rowsCreated}</td>
                    <td className="px-3 py-2 tabular">{b.rowsUpdated}</td>
                    <td className="px-3 py-2 tabular">{b.rowsRejected}</td>
                  </tr>
                ))}
                {s.importBatches.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                      Загрузок пока не было.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="exports">
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60 text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">Дата</th>
                  <th className="px-3 py-2 text-left">Моделей</th>
                  <th className="px-3 py-2 text-left">Строк</th>
                  <th className="px-3 py-2 text-left">Исключено</th>
                  <th className="px-3 py-2 text-left">Статус</th>
                </tr>
              </thead>
              <tbody>
                {s.exportHistory.map((e) => (
                  <tr key={e.id} className="border-b border-border">
                    <td className="px-3 py-2">{fmtDateTime(e.exportedAt)}</td>
                    <td className="px-3 py-2 tabular">{e.selectedProjectIds.length}</td>
                    <td className="px-3 py-2 tabular">{e.rowsExported}</td>
                    <td className="px-3 py-2 tabular">{e.excludedRows}</td>
                    <td className="px-3 py-2">{e.exportStatus}</td>
                  </tr>
                ))}
                {s.exportHistory.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      Выгрузок пока не было.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="projects">
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
            {s.projects.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="text-sm text-primary hover:underline">
                {p.name}
              </Link>
            ))}
            {s.projects.length === 0 && <p className="text-sm text-muted-foreground">Комплектующие этого поставщика пока не привязаны ни к одному проекту.</p>}
          </div>
        </TabsContent>
      </Tabs>

      <SupplierFormDialog open={editOpen} onOpenChange={setEditOpen} supplier={s} />
      <ImportWizardDialog open={importOpen} onOpenChange={setImportOpen} suppliers={[s]} defaultSupplierId={s.id} />
      <ExportWizardDialog open={exportOpen} onOpenChange={setExportOpen} suppliers={[s]} defaultSupplierId={s.id} />
      <PriceEditDialog crossReference={priceEditing} onOpenChange={(v) => !v && setPriceEditing(null)} />
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span>{value || "—"}</span>
    </div>
  );
}

function KpiTile({ label, value, isText }: { label: string; value: number | string; isText?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3.5 py-3">
      <div className={`font-semibold leading-none ${isText ? "text-sm" : "tabular text-2xl"}`}>{value}</div>
      <div className="mt-1.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
