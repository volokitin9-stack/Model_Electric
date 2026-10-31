import { useMemo, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Download, Plus, RefreshCw, Upload } from "lucide-react";
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

export function SuppliersPage() {
  const qc = useQueryClient();
  const suppliersQuery = useQuery({ queryKey: ["suppliers"], queryFn: api.listSuppliers });
  const componentsQuery = useQuery({ queryKey: ["components"], queryFn: () => api.listComponents() });
  const crossRefsQuery = useQuery({ queryKey: ["cross-references"], queryFn: api.listCrossReferences });
  const batchesQuery = useQuery({ queryKey: ["import-batches"], queryFn: () => api.listImportBatches() });

  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [priceEditing, setPriceEditing] = useState<CrossReference | null>(null);

  const suppliers = suppliersQuery.data ?? [];
  const components = componentsQuery.data ?? [];
  const crossRefs = crossRefsQuery.data ?? [];

  const profileQueries = useQueries({
    queries: suppliers.map((s) => ({
      queryKey: ["import-profiles", s.id],
      queryFn: () => api.listImportProfiles(s.id),
      enabled: suppliers.length > 0,
    })),
  });
  const allProfiles = profileQueries.flatMap((q, i) => (q.data ?? []).map((p) => ({ ...p, supplierCode: suppliers[i]?.code, supplierName: suppliers[i]?.name })));

  const kpis = useMemo(() => {
    const componentsWithOffer = new Set(crossRefs.map((r) => r.component?.id).filter(Boolean));
    const withoutCrossRef = components.length - componentsWithOffer.size;
    const withoutPrice = crossRefs.filter((r) => !r.currentPrice).length;
    const dates = [
      ...suppliers.map((s) => s.lastImportAt),
      ...crossRefs.map((r) => r.currentPrice?.effectiveAt),
    ].filter(Boolean) as string[];
    const lastUpdate = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
    return {
      total: suppliers.length,
      crossRefCount: crossRefs.length,
      withoutCrossRef: Math.max(0, withoutCrossRef),
      withoutPrice,
      lastUpdate,
    };
  }, [suppliers, components, crossRefs]);

  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["suppliers"] });
    qc.invalidateQueries({ queryKey: ["components"] });
    qc.invalidateQueries({ queryKey: ["cross-references"] });
    qc.invalidateQueries({ queryKey: ["import-batches"] });
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Поставщики комплектующих</h1>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Добавить поставщика
          </Button>
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw className="h-3.5 w-3.5" /> Обновить данные
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-3.5 w-3.5" /> Загрузить файл
          </Button>
          <Button size="sm" onClick={() => setExportOpen(true)}>
            <Download className="h-3.5 w-3.5" /> Выгрузить Excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <KpiTile label="Всего поставщиков" value={kpis.total} />
        <KpiTile label="Всего кроссировок" value={kpis.crossRefCount} />
        <KpiTile label="Комплектующие без кроссировок" value={kpis.withoutCrossRef} warn={kpis.withoutCrossRef > 0} />
        <KpiTile label="Кроссировки без цены" value={kpis.withoutPrice} warn={kpis.withoutPrice > 0} />
        <KpiTile label="Последнее обновление" value={fmtDateTime(kpis.lastUpdate)} isText />
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Все кроссировки</TabsTrigger>
          <TabsTrigger value="by-supplier">По поставщикам</TabsTrigger>
          <TabsTrigger value="profiles">Прайс-листы</TabsTrigger>
          <TabsTrigger value="history">История обновлений</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <div className="rounded-lg border border-border bg-card p-4">
            {crossRefsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Загрузка…</p>
            ) : (
              <CrossReferenceTable data={crossRefs} onEditPrice={setPriceEditing} />
            )}
          </div>
        </TabsContent>

        <TabsContent value="by-supplier">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {suppliers.map((s) => (
              <Link
                key={s.id}
                to={`/suppliers/${s.id}`}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-muted-foreground">{s.code}</span>
                </div>
                <div className="text-xs text-muted-foreground">{s.country || "Страна не указана"}</div>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span>{s.crossReferenceCount ?? 0} кроссировок</span>
                  <span>{s.pricedArticleCount ?? 0} с ценой</span>
                </div>
                <div className="text-xs text-muted-foreground">Обновлено: {fmtDateTime(s.lastImportAt)}</div>
              </Link>
            ))}
            {suppliers.length === 0 && <p className="text-sm text-muted-foreground">Поставщиков пока нет.</p>}
          </div>
        </TabsContent>

        <TabsContent value="profiles">
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60 text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">Поставщик</th>
                  <th className="px-3 py-2 text-left">Шаблон</th>
                  <th className="px-3 py-2 text-left">Формат</th>
                  <th className="px-3 py-2 text-left">Лист</th>
                  <th className="px-3 py-2 text-left">Код папки агента</th>
                </tr>
              </thead>
              <tbody>
                {allProfiles.map((p) => (
                  <tr key={p.id} className="border-b border-border">
                    <td className="px-3 py-2">{p.supplierCode} — {p.supplierName}</td>
                    <td className="px-3 py-2">{p.profileName}</td>
                    <td className="px-3 py-2 uppercase">{p.fileType}</td>
                    <td className="px-3 py-2">{p.sheetName || "—"}</td>
                    <td className="px-3 py-2">{p.localSourceKey || "—"}</td>
                  </tr>
                ))}
                {allProfiles.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      Шаблонов импорта пока нет — появятся после первой настройки обновления данных.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60 text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">Дата</th>
                  <th className="px-3 py-2 text-left">Поставщик</th>
                  <th className="px-3 py-2 text-left">Файл</th>
                  <th className="px-3 py-2 text-left">Статус</th>
                  <th className="px-3 py-2 text-left">Создано</th>
                  <th className="px-3 py-2 text-left">Обновлено</th>
                  <th className="px-3 py-2 text-left">Отклонено</th>
                </tr>
              </thead>
              <tbody>
                {(batchesQuery.data ?? []).map((b) => {
                  const supplier = suppliers.find((s) => s.id === b.supplierId);
                  return (
                    <tr key={b.id} className="border-b border-border">
                      <td className="px-3 py-2">{fmtDateTime(b.importedAt)}</td>
                      <td className="px-3 py-2">{supplier ? `${supplier.code} — ${supplier.name}` : b.supplierId}</td>
                      <td className="px-3 py-2">{b.sourceFile}</td>
                      <td className="px-3 py-2">{b.status === "applied" ? "Применено" : b.status === "previewed" ? "Предпросмотр" : b.status}</td>
                      <td className="px-3 py-2 tabular">{b.rowsCreated}</td>
                      <td className="px-3 py-2 tabular">{b.rowsUpdated}</td>
                      <td className="px-3 py-2 tabular">{b.rowsRejected}</td>
                    </tr>
                  );
                })}
                {(batchesQuery.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                      Обновлений пока не было.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <SupplierFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ImportWizardDialog open={importOpen} onOpenChange={setImportOpen} suppliers={suppliers} />
      <ExportWizardDialog open={exportOpen} onOpenChange={setExportOpen} suppliers={suppliers} />
      <PriceEditDialog crossReference={priceEditing} onOpenChange={(v) => !v && setPriceEditing(null)} />
    </div>
  );
}

function KpiTile({ label, value, warn, isText }: { label: string; value: number | string; warn?: boolean; isText?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3.5 py-3">
      <div className={`font-semibold leading-none ${isText ? "text-sm" : "tabular text-2xl"} ${warn ? "text-[var(--status-waiting-fg)]" : ""}`}>
        {value}
      </div>
      <div className="mt-1.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
