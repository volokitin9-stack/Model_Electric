import { useEffect, useMemo, useState } from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronLeft, ChevronRight, Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ColumnFilter } from "@/components/column-filter";
import { useLocalStorageState } from "@/hooks/use-local-storage";
import { cn } from "@/lib/utils";
import { dateRange, enumIn, textContains } from "@/lib/table-filters";
import { AVAILABILITY_LABELS, CROSS_REFERENCE_STATUS_LABELS } from "@/lib/statuses";
import type { CrossReference } from "@/lib/types";

const COLUMN_LABELS: Record<string, string> = {
  ourArticle: "Наш артикул",
  componentName: "Наименование",
  supplierCode: "Поставщик",
  supplierArticle: "Артикул поставщика",
  price: "Цена",
  currency: "Валюта",
  availability: "Наличие",
  moq: "Мин. партия",
  leadTime: "Срок поставки",
  updatedAt: "Дата обновления",
  source: "Источник",
  status: "Статус проверки",
  models: "Модели",
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function CrossReferenceTable({
  data,
  storageKey = "me.xref.table",
  onEditPrice,
}: {
  data: CrossReference[];
  storageKey?: string;
  onEditPrice?: (row: CrossReference) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "updatedAt", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useLocalStorageState<VisibilityState>(`${storageKey}.visibility`, {});
  const [pageSize, setPageSize] = useLocalStorageState<number>(`${storageKey}.pageSize`, 20);
  const [pageIndex, setPageIndex] = useState(0);

  const rows = useMemo(
    () =>
      data.map((r) => ({
        id: r.id,
        raw: r,
        ourArticle: r.component?.internalArticle ?? "",
        componentName: r.component?.name ?? "",
        supplierCode: r.supplier?.code ?? "",
        supplierName: r.supplier?.name ?? "",
        supplierArticle: r.supplierArticle,
        price: r.currentPrice?.price ?? null,
        currency: r.currentPrice?.currency ?? "",
        availability: r.currentPrice?.availability ?? "",
        moq: r.currentPrice?.minimumOrderQuantity ?? null,
        leadTime: r.currentPrice?.leadTimeDays ?? null,
        updatedAt: r.currentPrice?.effectiveAt ?? r.updatedAt,
        source: r.source,
        status: r.status,
        models: (r.projects ?? []).map((p) => p.name).join(", "),
      })),
    [data],
  );
  type Row = (typeof rows)[number];

  useEffect(() => setPageIndex(0), [columnFilters]);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: "ourArticle",
        accessorKey: "ourArticle",
        header: ({ column }) => (
          <div className="flex items-center">
            Наш артикул
            <ColumnFilter column={column} kind="text" />
          </div>
        ),
        size: 130,
        filterFn: textContains as any,
        cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span>,
      },
      {
        id: "componentName",
        accessorKey: "componentName",
        header: ({ column }) => (
          <div className="flex items-center">
            Наименование
            <ColumnFilter column={column} kind="text" />
          </div>
        ),
        size: 220,
        filterFn: textContains as any,
      },
      {
        id: "supplierCode",
        accessorKey: "supplierCode",
        header: ({ column }) => (
          <div className="flex items-center">
            Поставщик
            <ColumnFilter column={column} kind="enum" />
          </div>
        ),
        size: 120,
        filterFn: enumIn as any,
        cell: ({ row }) => <span title={row.original.supplierName}>{row.original.supplierCode}</span>,
      },
      {
        id: "supplierArticle",
        accessorKey: "supplierArticle",
        header: ({ column }) => (
          <div className="flex items-center">
            Артикул поставщика
            <ColumnFilter column={column} kind="text" />
          </div>
        ),
        size: 160,
        filterFn: textContains as any,
      },
      {
        id: "price",
        accessorKey: "price",
        header: ({ column }) => (
          <button className="flex items-center gap-1" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Цена <ArrowUpDown className="h-3 w-3" />
          </button>
        ),
        size: 110,
        cell: ({ row }) =>
          row.original.price != null ? (
            <button
              type="button"
              className="tabular hover:underline"
              onClick={() => onEditPrice?.(row.original.raw)}
              title="Изменить цену"
            >
              {row.original.price}
            </button>
          ) : (
            <button type="button" className="text-muted-foreground hover:underline" onClick={() => onEditPrice?.(row.original.raw)}>
              указать цену
            </button>
          ),
      },
      {
        id: "currency",
        accessorKey: "currency",
        header: ({ column }) => (
          <div className="flex items-center">
            Валюта
            <ColumnFilter column={column} kind="enum" />
          </div>
        ),
        size: 90,
        filterFn: enumIn as any,
      },
      {
        id: "availability",
        accessorKey: "availability",
        header: ({ column }) => (
          <div className="flex items-center">
            Наличие
            <ColumnFilter column={column} kind="enum" labelOf={(v) => AVAILABILITY_LABELS[v] ?? v} />
          </div>
        ),
        size: 110,
        filterFn: enumIn as any,
        cell: ({ getValue }) => {
          const v = getValue() as string;
          return v ? AVAILABILITY_LABELS[v] ?? v : "—";
        },
      },
      {
        id: "moq",
        accessorKey: "moq",
        header: "Мин. партия",
        size: 110,
        cell: ({ getValue }) => (getValue() as number | null) ?? "—",
      },
      {
        id: "leadTime",
        accessorKey: "leadTime",
        header: "Срок поставки",
        size: 120,
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return v != null ? `${v} дн.` : "—";
        },
      },
      {
        id: "updatedAt",
        accessorKey: "updatedAt",
        header: ({ column }) => (
          <div className="flex items-center">
            <button className="flex items-center gap-1" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
              Обновлено <ArrowUpDown className="h-3 w-3" />
            </button>
            <ColumnFilter column={column} kind="date" />
          </div>
        ),
        size: 120,
        filterFn: dateRange as any,
        cell: ({ getValue }) => fmtDate(getValue() as string),
      },
      {
        id: "source",
        accessorKey: "source",
        header: ({ column }) => (
          <div className="flex items-center">
            Источник
            <ColumnFilter column={column} kind="enum" labelOf={(v) => (v === "manual" ? "Вручную" : "Импорт")} />
          </div>
        ),
        size: 100,
        filterFn: enumIn as any,
        cell: ({ getValue }) => ((getValue() as string) === "manual" ? "Вручную" : "Импорт"),
      },
      {
        id: "status",
        accessorKey: "status",
        header: ({ column }) => (
          <div className="flex items-center">
            Статус
            <ColumnFilter column={column} kind="enum" labelOf={(v) => CROSS_REFERENCE_STATUS_LABELS[v] ?? v} />
          </div>
        ),
        size: 140,
        filterFn: enumIn as any,
        cell: ({ getValue }) => {
          const v = getValue() as string;
          return (
            <span className={cn(v === "discontinued" && "text-[var(--status-problem-fg)]")}>
              {CROSS_REFERENCE_STATUS_LABELS[v] ?? v}
            </span>
          );
        },
      },
      {
        id: "models",
        accessorKey: "models",
        header: ({ column }) => (
          <div className="flex items-center">
            Модели
            <ColumnFilter column={column} kind="text" />
          </div>
        ),
        size: 220,
        filterFn: textContains as any,
        cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as string) || "—"}</span>,
      },
    ],
    [onEditPrice],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnFilters, columnVisibility, pagination: { pageIndex, pageSize } },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater({ pageIndex, pageSize }) : updater;
      setPageIndex(next.pageIndex);
      setPageSize(next.pageSize);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    columnResizeMode: "onChange",
    enableColumnResizing: true,
  });

  const visibleRows = table.getRowModel().rows;
  const pageCount = table.getPageCount();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Показано {visibleRows.length} из {rows.length}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3 className="h-3.5 w-3.5" /> Колонки
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Видимость колонок</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table
              .getAllLeafColumns()
              .filter((c) => c.id !== "ourArticle")
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(v) => column.toggleVisibility(Boolean(v))}
                  onSelect={(e) => e.preventDefault()}
                >
                  {COLUMN_LABELS[column.id] ?? column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table style={{ width: table.getTotalSize() }}>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((header, idx) => (
                  <TableHead
                    key={header.id}
                    style={{ width: header.getSize(), position: "relative" }}
                    className={cn(idx === 0 && "sticky left-0 z-20 bg-muted/95")}
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    <div
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-primary/40"
                    />
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {visibleRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-10 text-center text-sm text-muted-foreground">
                  Нет кроссировок по заданным фильтрам
                </TableCell>
              </TableRow>
            )}
            {visibleRows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell, idx) => (
                  <TableCell key={cell.id} style={{ width: cell.column.getSize() }} className={cn(idx === 0 && "sticky left-0 z-10 bg-card")}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>Строк на странице</span>
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="h-7 w-16 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span>
            Стр. {pageCount === 0 ? 0 : pageIndex + 1} из {pageCount}
          </span>
          <Button variant="outline" size="icon" className="h-7 w-7" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
