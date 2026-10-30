// Единое описание статусов — процессы, допустимые значения, подписи,
// и что считается "закрыто" для расчёта прогресса. Источник правды
// для API (валидация, прогресс, ближайшее действие). Веб-клиент
// держит зеркальную копию в apps/web/src/lib/statuses.ts: вынесение
// в общий пакет — естественный следующий шаг (см. README).

export const BASE_STATUSES = [
  "not_started",
  "in_progress",
  "waiting",
  "done",
  "problem",
  "not_required",
  "cancelled",
] as const;

export const ORDER_STATUSES = [
  "not_started",
  "preparing_order",
  "order_placed",
  "problem",
  "not_required",
] as const;

export const PAYMENT_STATUSES = [
  "not_started",
  "awaiting_payment",
  "paid",
  "problem",
  "not_required",
] as const;

// В исходном ТЗ список статусов поставки обрывается на "Проблема" —
// это явно обрезанный конец сообщения (у двух соседних закупочных
// процессов — "Заказ разъёмов" и "Оплата" — список заканчивается
// значением "Не требуется"). По аналогии с ними считаем, что
// "Не требуется" должно быть и здесь; явное допущение, см. README.
export const SUPPLY_STATUSES = [
  "not_started",
  "awaiting_shipment",
  "in_transit",
  "received",
  "problem",
  "not_required",
] as const;

export type BaseStatus = (typeof BASE_STATUSES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type SupplyStatus = (typeof SUPPLY_STATUSES)[number];

export const OVERALL_STATUSES = [
  "active",
  "waiting",
  "ready",
  "completed",
  "cancelled",
] as const;
export type OverallStatus = (typeof OVERALL_STATUSES)[number];

export const PROCESS_FIELDS = [
  "searchConnectors",
  "schemeDevelopment",
  "orderConnectors",
  "payment",
  "supplyConnectors",
  "orderTooling",
  "supplyTooling",
] as const;
export type ProcessField = (typeof PROCESS_FIELDS)[number];

// Допустимые значения и "закрывающие" (resolved) значения для каждого
// процесса. Закрыт = не требует больше внимания PM — учитывается в
// расчёте прогресса.
export const PROCESS_CONFIG: Record<
  ProcessField,
  { options: readonly string[]; resolved: readonly string[] }
> = {
  searchConnectors: { options: BASE_STATUSES, resolved: ["done", "not_required"] },
  schemeDevelopment: { options: BASE_STATUSES, resolved: ["done", "not_required"] },
  orderConnectors: { options: ORDER_STATUSES, resolved: ["order_placed", "not_required"] },
  payment: { options: PAYMENT_STATUSES, resolved: ["paid", "not_required"] },
  supplyConnectors: { options: SUPPLY_STATUSES, resolved: ["received", "not_required"] },
  // Отдельного набора статусов для оснастки в ТЗ не было — по аналогии
  // со связкой "заказ/поставка разъёмов" используются те же наборы,
  // что для orderConnectors/supplyConnectors. Решение зафиксировано
  // в README как явное допущение.
  orderTooling: { options: ORDER_STATUSES, resolved: ["order_placed", "not_required"] },
  supplyTooling: { options: SUPPLY_STATUSES, resolved: ["received", "not_required"] },
};

export const PROCESS_LABELS: Record<ProcessField, string> = {
  searchConnectors: "Поиск разъёмов",
  schemeDevelopment: "Разработка схемы",
  orderConnectors: "Заказ разъёмов",
  payment: "Оплата",
  supplyConnectors: "Поставка разъёмов",
  orderTooling: "Заказ оснастки",
  supplyTooling: "Поставка оснастки",
};

export const STATUS_LABELS: Record<string, string> = {
  not_started: "Не начато",
  in_progress: "В работе",
  waiting: "Ожидание",
  done: "Завершено",
  problem: "Проблема",
  not_required: "Не требуется",
  cancelled: "Отменено",
  preparing_order: "Подготовка заказа",
  order_placed: "Заказ оформлен",
  awaiting_payment: "Ожидает оплаты",
  paid: "Оплачено",
  awaiting_shipment: "Ожидается отгрузка",
  in_transit: "В пути",
  received: "Получено",
  active: "Активен",
  ready: "Готов к запуску",
  completed: "Завершён",
};

export const OTHER_FIELD_LABELS: Record<string, string> = {
  name: "Название проекта",
  article: "Артикул",
  responsible: "Ответственный",
  overallStatus: "Общий статус",
  plannedDate: "Плановая дата завершения",
};

export function fieldLabel(field: string): string {
  return (
    OTHER_FIELD_LABELS[field] ??
    PROCESS_LABELS[field as ProcessField] ??
    field
  );
}

export function isValidProcessValue(field: ProcessField, value: string): boolean {
  return (PROCESS_CONFIG[field].options as readonly string[]).includes(value);
}

type ProjectLike = Record<ProcessField, string>;

/** Прогресс проекта: доля процессов в "закрывающем" статусе, 0-100. */
export function computeProgress(project: ProjectLike): number {
  const total = PROCESS_FIELDS.length;
  const resolved = PROCESS_FIELDS.filter((f) =>
    (PROCESS_CONFIG[f].resolved as readonly string[]).includes(project[f]),
  ).length;
  return Math.round((resolved / total) * 100);
}

/** Ближайшее действие: первый незакрытый процесс по фиксированному порядку. */
export function computeNextAction(project: ProjectLike): string {
  for (const f of PROCESS_FIELDS) {
    const cfg = PROCESS_CONFIG[f];
    if (!(cfg.resolved as readonly string[]).includes(project[f])) {
      return PROCESS_LABELS[f];
    }
  }
  return "Нет — все процессы закрыты";
}
