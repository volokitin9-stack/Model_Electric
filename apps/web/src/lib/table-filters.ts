import type { FilterFn } from "@tanstack/react-table";
import type { Project } from "./types";

export const textContains: FilterFn<Project> = (row, columnId, filterValue) => {
  if (!filterValue) return true;
  const cell = row.getValue(columnId);
  return String(cell ?? "")
    .toLowerCase()
    .includes(String(filterValue).toLowerCase());
};

export const enumIn: FilterFn<Project> = (row, columnId, filterValue) => {
  if (filterValue === undefined) return true;
  if (!Array.isArray(filterValue)) return true;
  return filterValue.includes(String(row.getValue(columnId)));
};

export const dateRange: FilterFn<Project> = (row, columnId, filterValue: { from?: string; to?: string } | undefined) => {
  if (!filterValue || (!filterValue.from && !filterValue.to)) return true;
  const raw = row.getValue(columnId) as string | null;
  if (!raw) return false;
  const value = raw.slice(0, 10);
  if (filterValue.from && value < filterValue.from) return false;
  if (filterValue.to && value > filterValue.to) return false;
  return true;
};

export const globalSearch: FilterFn<Project> = (row, _columnId, filterValue) => {
  if (!filterValue) return true;
  const q = String(filterValue).toLowerCase();
  const p = row.original;
  return [p.name, p.article, p.responsible].some((v) => (v ?? "").toLowerCase().includes(q));
};
