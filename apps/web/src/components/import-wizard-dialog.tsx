import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import type { ColumnMapping, ImportDiff, ImportProfile, Supplier } from "@/lib/types";

type Step = "pick" | "mapping" | "preview" | "done";

const FIELD_LABELS: Record<keyof ColumnMapping, string> = {
  ourArticle: "Наш артикул",
  supplierArticle: "Артикул поставщика (обязательно)",
  price: "Цена",
  currency: "Валюта",
  availability: "Наличие",
  moq: "Мин. партия",
  leadTimeDays: "Срок поставки, дн.",
};

export function ImportWizardDialog({
  open,
  onOpenChange,
  suppliers,
  defaultSupplierId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  suppliers: Supplier[];
  defaultSupplierId?: string;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("pick");
  const [supplierId, setSupplierId] = useState(defaultSupplierId ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [sheetName, setSheetName] = useState<string>("");
  const [headerRow, setHeaderRow] = useState(1);
  const [dataStartRow, setDataStartRow] = useState(2);
  const [mapping, setMapping] = useState<Partial<Record<keyof ColumnMapping, string>>>({});
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [saveAsProfile, setSaveAsProfile] = useState(true);
  const [profileName, setProfileName] = useState("");

  const [diff, setDiff] = useState<ImportDiff["diff"] | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [alreadyImportedMsg, setAlreadyImportedMsg] = useState<string | null>(null);

  const profilesQuery = useQuery({
    queryKey: ["import-profiles", supplierId],
    queryFn: () => api.listImportProfiles(supplierId),
    enabled: Boolean(supplierId) && open,
  });

  useEffect(() => {
    if (open) {
      setStep("pick");
      setSupplierId(defaultSupplierId ?? "");
      setFile(null);
      setError(null);
      setDiff(null);
      setBatchId(null);
      setAlreadyImportedMsg(null);
      setSelectedProfileId("");
    }
  }, [open, defaultSupplierId]);

  const inspectMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Выберите файл");
      return api.inspectImportFile(file);
    },
    onSuccess: (data) => {
      setSheetNames(data.sheetNames);
      setHeaders(data.headers);
      setSampleRows(data.sampleRows);
      setSheetName(data.sheetNames[0] ?? "");
      setStep("mapping");
    },
    onError: (e: Error) => setError(e.message),
  });

  function applyProfile(profile: ImportProfile) {
    setSelectedProfileId(profile.id);
    setSheetName(profile.sheetName ?? sheetNames[0] ?? "");
    setHeaderRow(profile.headerRow);
    setDataStartRow(profile.dataStartRow);
    const m: Partial<Record<keyof ColumnMapping, string>> = {};
    for (const [k, v] of Object.entries(profile.columnMapping)) m[k as keyof ColumnMapping] = String(v);
    setMapping(m);
    setSaveAsProfile(false);
  }

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Нет файла");
      if (!mapping.supplierArticle) throw new Error("Укажите колонку с артикулом поставщика");

      let profileId = selectedProfileId || undefined;
      if (!profileId) {
        const columnMapping: ColumnMapping = {
          supplierArticle: Number(mapping.supplierArticle),
          ...(mapping.ourArticle ? { ourArticle: Number(mapping.ourArticle) } : {}),
          ...(mapping.price ? { price: Number(mapping.price) } : {}),
          ...(mapping.currency ? { currency: Number(mapping.currency) } : {}),
          ...(mapping.availability ? { availability: Number(mapping.availability) } : {}),
          ...(mapping.moq ? { moq: Number(mapping.moq) } : {}),
          ...(mapping.leadTimeDays ? { leadTimeDays: Number(mapping.leadTimeDays) } : {}),
        };
        if (saveAsProfile) {
          const created = await api.createImportProfile({
            supplierId,
            profileName: profileName.trim() || `Шаблон от ${new Date().toLocaleDateString("ru-RU")}`,
            fileType: file.name.endsWith(".csv") ? "csv" : file.name.endsWith(".xls") ? "xls" : "xlsx",
            sheetName,
            headerRow,
            dataStartRow,
            columnMapping,
          });
          profileId = created.id;
          qc.invalidateQueries({ queryKey: ["import-profiles", supplierId] });
        } else {
          const result = await api.previewImport({
            file,
            supplierId,
            parseConfig: { sheetName, headerRow, dataStartRow, columnMapping },
          });
          return result;
        }
      }
      return api.previewImport({ file, supplierId, profileId });
    },
    onSuccess: (result) => {
      if (result.alreadyImported) {
        setAlreadyImportedMsg(result.message);
        setDiff(null);
      } else {
        setDiff(result.diff);
        setBatchId(result.batchId);
        setAlreadyImportedMsg(null);
      }
      setStep("preview");
    },
    onError: (e: Error) => setError(e.message),
  });

  const confirmMutation = useMutation({
    mutationFn: () => api.confirmImport(batchId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cross-references"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["supplier"] });
      qc.invalidateQueries({ queryKey: ["import-batches"] });
      setStep("done");
    },
    onError: (e: Error) => setError(e.message),
  });

  const columnOptions = headers.map((h, i) => ({ value: String(i), label: h || `Колонка ${i + 1}` }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Обновить данные поставщика</DialogTitle>
        </DialogHeader>

        {step === "pick" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Поставщик</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите поставщика" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="file">Файл (XLSX, XLS или CSV)</Label>
              <Input id="file" type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <p className="text-xs text-muted-foreground">
                Загружается из браузера. Для чтения файлов прямо с локальной папки на компьютере см.
                Local Import Agent (apps/local-import-agent) — он работает через этот же API.
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
              <Button
                type="button"
                disabled={!supplierId || !file || inspectMutation.isPending}
                onClick={() => {
                  setError(null);
                  inspectMutation.mutate();
                }}
              >
                Далее
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "mapping" && (
          <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
            {profilesQuery.data && profilesQuery.data.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label>Использовать сохранённый шаблон</Label>
                <div className="flex flex-wrap gap-2">
                  {profilesQuery.data.map((p) => (
                    <Button
                      key={p.id}
                      type="button"
                      size="sm"
                      variant={selectedProfileId === p.id ? "default" : "outline"}
                      onClick={() => applyProfile(p)}
                    >
                      {p.profileName}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant={!selectedProfileId ? "default" : "outline"}
                    onClick={() => {
                      setSelectedProfileId("");
                      setSaveAsProfile(true);
                    }}
                  >
                    Настроить заново
                  </Button>
                </div>
                <Separator className="my-1" />
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              {sheetNames.length > 1 && (
                <div className="flex flex-col gap-1.5">
                  <Label>Лист</Label>
                  <Select value={sheetName} onValueChange={setSheetName}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sheetNames.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="headerRow">Строка заголовков</Label>
                <Input id="headerRow" type="number" min={1} value={headerRow} onChange={(e) => setHeaderRow(Number(e.target.value) || 1)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dataStart">Первая строка данных</Label>
                <Input id="dataStart" type="number" min={1} value={dataStartRow} onChange={(e) => setDataStartRow(Number(e.target.value) || 2)} />
              </div>
            </div>

            <div className="rounded-md border border-border p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Какая колонка — какое поле</div>
              <div className="grid grid-cols-2 gap-3">
                {(Object.keys(FIELD_LABELS) as (keyof ColumnMapping)[]).map((field) => (
                  <div key={field} className="flex flex-col gap-1.5">
                    <Label>{FIELD_LABELS[field]}</Label>
                    <Select
                      value={mapping[field] ?? "__none"}
                      onValueChange={(v) => setMapping({ ...mapping, [field]: v === "__none" ? undefined : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">—</SelectItem>
                        {columnOptions.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {sampleRows.length > 0 && (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/60">
                      {headers.map((h, i) => (
                        <th key={i} className="px-2 py-1 text-left font-medium">
                          {h || `Колонка ${i + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sampleRows.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        {r.map((c, j) => (
                          <td key={j} className="px-2 py-1">
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!selectedProfileId && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={saveAsProfile} onChange={(e) => setSaveAsProfile(e.target.checked)} />
                Сохранить как шаблон для следующих обновлений
                {saveAsProfile && (
                  <Input
                    className="ml-2 h-7 w-56 text-xs"
                    placeholder="Название шаблона"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                  />
                )}
              </label>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep("pick")}>
                Назад
              </Button>
              <Button
                type="button"
                disabled={previewMutation.isPending}
                onClick={() => {
                  setError(null);
                  previewMutation.mutate();
                }}
              >
                Показать предпросмотр
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "preview" && (
          <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
            {alreadyImportedMsg ? (
              <p className="rounded-md border border-border bg-muted/40 p-3 text-sm">{alreadyImportedMsg}</p>
            ) : diff ? (
              <>
                <div className="grid grid-cols-3 gap-2 text-sm sm:grid-cols-4">
                  <Stat label="Новые кроссировки" value={diff.counts.newLinks} tone="done" />
                  <Stat label="Изменения цены" value={diff.counts.priceUpdates} tone="progress" />
                  <Stat label="Без изменений" value={diff.counts.noChange} tone="neutral" />
                  <Stat label="Неизвестные артикулы" value={diff.counts.unknownArticles} tone="waiting" />
                  <Stat label="Без привязки" value={diff.counts.orphanPrices} tone="waiting" />
                  <Stat label="Дубли" value={diff.counts.duplicates} tone="problem" />
                  <Stat label="Ошибки" value={diff.counts.errors} tone="problem" />
                </div>
                <DiffList title="Новые кроссировки" rows={diff.newLinks} render={(r) => `${r.ourArticle} → ${r.supplierArticle} (${r.price ?? "без цены"} ${r.currency ?? ""})`} />
                <DiffList title="Изменения цены" rows={diff.priceUpdates} render={(r) => `${r.ourArticle} / ${r.supplierArticle}: ${r.oldPrice ?? "—"} → ${r.newPrice} ${r.currency}`} />
                <DiffList title="Неизвестные внутренние артикулы" rows={diff.unknownArticles} render={(r) => `строка ${r.rowNumber}: ${r.ourArticle} (${r.supplierArticle})`} />
                <DiffList title="Цены без привязки к кроссировке" rows={diff.orphanPrices} render={(r) => `строка ${r.rowNumber}: ${r.supplierArticle}`} />
                <DiffList title="Ошибки" rows={diff.errors} render={(r) => `строка ${r.rowNumber}: ${r.reason}`} />
              </>
            ) : null}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Закрыть
              </Button>
              {diff && (
                <Button type="button" disabled={confirmMutation.isPending} onClick={() => confirmMutation.mutate()}>
                  Подтвердить и применить
                </Button>
              )}
            </DialogFooter>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm">Обновление применено.</p>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Готово
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-md border border-border p-2">
      <div className={`tabular text-lg font-semibold text-[var(--status-${tone}-fg)]`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function DiffList({ title, rows, render }: { title: string; rows: any[]; render: (r: any) => string }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title} ({rows.length})
      </div>
      <ul className="max-h-32 overflow-y-auto rounded-md border border-border p-2 text-xs">
        {rows.slice(0, 50).map((r, i) => (
          <li key={i} className="py-0.5">
            {render(r)}
          </li>
        ))}
        {rows.length > 50 && <li className="text-muted-foreground">…и ещё {rows.length - 50}</li>}
      </ul>
    </div>
  );
}
