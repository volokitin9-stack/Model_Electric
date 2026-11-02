import { fieldLabel, STATUS_LABELS } from "./statuses.js";

const TRACKED_FIELDS = [
  "name",
  "article",
  "responsible",
  "overallStatus",
  "searchConnectors",
  "schemeDevelopment",
  "orderConnectors",
  "payment",
  "supplyConnectors",
  "orderTooling",
  "supplyTooling",
  "plannedDate",
] as const;

function displayValue(field: string, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (field === "plannedDate") {
    return new Date(value as string | Date).toISOString().slice(0, 10);
  }
  if (typeof value === "string" && STATUS_LABELS[value]) return STATUS_LABELS[value];
  return String(value);
}

/**
 * Сравнивает старую запись проекта и входящий patch, возвращает одну
 * запись журнала на каждое реально изменившееся отслеживаемое поле.
 */
export function diffProjectChanges(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
): Array<{ field: string; fieldLabel: string; oldValue: string | null; newValue: string | null }> {
  const entries: Array<{ field: string; fieldLabel: string; oldValue: string | null; newValue: string | null }> = [];

  for (const field of TRACKED_FIELDS) {
    if (!(field in patch)) continue;
    const oldRaw = before[field];
    const newRaw = patch[field];

    const oldComparable = field === "plannedDate" && oldRaw ? new Date(oldRaw as string).toISOString() : oldRaw;
    const newComparable = field === "plannedDate" && newRaw ? new Date(newRaw as string).toISOString() : newRaw;
    if (oldComparable === newComparable) continue;

    entries.push({
      field,
      fieldLabel: fieldLabel(field),
      oldValue: displayValue(field, oldRaw),
      newValue: displayValue(field, newRaw),
    });
  }

  return entries;
}
