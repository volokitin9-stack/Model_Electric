import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import { ArrowUpDown, ChevronLeft, ChevronRight, Columns3, PanelRight } from "lucide-react";
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
import { StatusSelect } from "@/components/status-select";
import { useLocalStorageState } from "@/hooks/use-local-storage";
import { cn } from "@/lib/utils";
import { dateRange, enumIn, globalSearch, textContains } from "@/lib/table-filters";
import {
  OVERALL_STATUSES,
  OVERALL_STATUS_LABELS,
  PROCESS_FIELDS,
  PROCESS_LABELS,
  PROCESS_OPTIONS,
  STATUS_LABELS,
} from "@/lib/statuses";
import type { Project } from "@/lib/types";

const COLUMN_LABELS: Record<string, string> = {
  name: "Название проекта",
  article: "Артикул",
  responsible: "Ответственный",
  overallStatus: "Общий статус",
  ...PROCESS_LABELS,
  progress: "Прогресс",
  plannedDate: "Плановая дата завершения",
  nextAction: "Ближайшее действие",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function isOverdueRow(p: Project): boolean {
  if (!p.plannedDate) return false;
  if (p.overallStatus === "completed" || p.overallStatus === "cancelled") return false;
  return p.plannedDate.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

export function ProjectsTable({
  data,
  globalFilter,
  externalFilter,
  onUpdateField,
  onOpenSidePanel,
}: {
  data: Project[];
  globalFilter: string;
  /** Доп. предикат от KPI-карточек (поверх обычных фильтров колонок). */
  externalFilter: (p: Project) => boolean;
  onUpdateField: (id: string, field: string, value: string) => void;
  onOpenSidePanel: (project: Project) => void;
}) {
  // Порядок по умолчанию — как отдаёт API (по updatedAt, самые свежие
  // сверху); отдельной колонки под updatedAt в таблице нет.
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useLocalStorageState<VisibilityState>(
    "me.table.visibility",
    {},
  );
  const [columnSizing, setColumnSizing] = useLocalStorageState<Record<string, number>>(
    "me.table.sizing",
    {},
  );
  const [pageSize, setPageSize] = useLocalStorageState<number>("me.table.pageSize", 10);
  const [pageIndex, setPageIndex] = useState(0);

  const filteredData = useMemo(() => data.filter(externalFilter), [data, externalFilter]);

  useEffect(() => {
    setPageIndex(0);
  }, [globalFilter, externalFilter]);

  const columns = useMemo<ColumnDef<Project>[]>(() => {
    const statusColumn = (field: (typeof PROCESS_FIELDS)[number]): ColumnDef<Project> => ({
      id: field,
      accessorKey: field,
      header: ({ column }) => (
        <div className="flex items-center">
          {PROCESS_LABELS[field]}
          <ColumnFilter column={column} kind="enum" labelOf={(v) => STATUS_LABELS[v] ?? v} />
        </div>
      ),
      size: 150,
      filterFn: enumIn,
      cell: ({ row }) => (
        <StatusSelect
          value={row.original[field]}
          options={PROCESS_OPTIONS[field]}
          onChange={(v) => onUpdateField(row.original.id, field, v)}
        />
      ),
    });

    const cols: ColumnDef<Project>[] = [
      {
        id: "name",
        accessorKey: "name",
        header: ({ column }) => (
          <div className="flex items-center">
            Название проекта
            <ColumnFilter column={column} kind="text" />
          </div>
        ),
        size: 260,
        minSize: 160,
        filterFn: textContains,
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => onOpenSidePanel(row.original)}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Открыть боковую панель"
            >
              <PanelRight className="h-3.5 w-3.5" />
            </button>
            <Link
              to={`/projects/${row.original.id}`}
              className="truncate font-medium text-primary hover:underline"
              title={row.original.name}
            >
              {row.original.name}
            </Link>
          </div>
        ),
      },
      {
        id: "article",
        accessorKey: "article",
        header: ({ column }) => (
          <div className="flex items-center">
            Артикул
            <ColumnFilter column={column} kind="text" />
          </div>
        ),
        size: 140,
        filterFn: textContains,
        cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as string) || "—"}</span>,
      },
      {
        id: "responsible",
        accessorKey: "responsible",
        header: ({ column }) => (
          <div className="flex items-center">
            Ответственный
            <ColumnFilter column={column} kind="text" />
          </div>
        ),
        size: 150,
        filterFn: textContains,
        cell: ({ getValue }) => (getValue() as string) || "—",
      },
      {
        id: "overallStatus",
        accessorKey: "overallStatus",
        header: ({ column }) => (
          <div className="flex items-center">
            Общий статус
            <ColumnFilter column={column} kind="enum" labelOf={(v) => OVERALL_STATUS_LABELS[v as keyof typeof OVERALL_STATUS_LABELS] ?? v} />
          </div>
        ),
        size: 150,
        filterFn: enumIn,
        cell: ({ row }) => (
          <StatusSelect
            value={row.original.overallStatus}
            options={OVERALL_STATUSES}
            onChange={(v) => onUpdateField(row.original.id, "overallStatus", v)}
          />
        ),
      },
      ...PROCESS_FIELDS.map(statusColumn),
      {
        id: "progress",
        accessorKey: "progress",
        header: ({ column }) => (
          <button className="flex items-center gap-1" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Прогресс <ArrowUpDown className="h-3 w-3" />
          </button>
        ),
        size: 120,
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", v === 100 ? "bg-[var(--status-done-fg)]" : "bg-primary")}
                  style={{ width: `${v}%` }}
                />
              </div>
              <span className="tabular text-xs text-muted-foreground">{v}%</span>
            </div>
          );
        },
      },
      {
        id: "plannedDate",
        accessorKey: "plannedDate",
        header: ({ column }) => (
          <div className="flex items-center">
            <button className="flex items-center gap-1" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
              Плановая дата <ArrowUpDown className="h-3 w-3" />
            </button>
            <ColumnFilter column={column} kind="date" />
          </div>
        ),
        size: 140,
        filterFn: dateRange,
        sortingFn: (a, b) => {
          const av = a.original.plannedDate ?? "";
          const bv = b.original.plannedDate ?? "";
          return av < bv ? -1 : av > bv ? 1 : 0;
        },
        cell: ({ row }) => (
          <span className={cn(isOverdueRow(row.original) && "font-semibold text-[var(--status-problem-fg)]")}>
            {fmtDate(row.original.plannedDate)}
          </span>
        ),
      },
      {
        id: "nextAction",
        accessorKey: "nextAction",
        header: ({ column }) => (
          <div className="flex items-center">
            Ближайшее действие
            <ColumnFilter column={column} kind="enum" />
          </div>
        ),
        size: 190,
        filterFn: enumIn,
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() as string}</span>,
      },
    ];
    return cols;
  }, [onUpdateField, onOpenSidePanel]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, columnFilters, columnVisibility, columnSizing, globalFilter, pagination: { pageIndex, pageSize } },
    onSortingChange: setSorting,
    onColumnFiltersChange: (updater) => {
      setColumnFilters(updater);
      setPageIndex(0);
    },
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: (updater) =>
      setColumnSizing((prev) => (typeof updater === "function" ? updater(prev) : updater)),
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater({ pageIndex, pageSize }) : updater;
      setPageIndex(next.pageIndex);
      setPageSize(next.pageSize);
    },
    globalFilterFn: globalSearch,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    columnResizeMode: "onChange",
    enableColumnResizing: true,
  });

  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Показано {rows.length} из {filteredData.length}
          {filteredData.length !== data.length ? ` (всего ${data.length})` : ""}
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
              .filter((c) => c.id !== "name")
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
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-10 text-center text-sm text-muted-foreground">
                  Нет проектов по заданным фильтрам
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell, idx) => (
                  <TableCell
                    key={cell.id}
                    style={{ width: cell.column.getSize() }}
                    className={cn(idx === 0 && "sticky left-0 z-10 bg-card")}
                  >
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
