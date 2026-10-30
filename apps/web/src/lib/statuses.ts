// Зеркало apps/server/src/statuses.ts — единый источник правды для
// допустимых значений и подписей статусов. Вынесение в общий пакет
// (packages/shared) — следующий шаг после этой итерации, см. README
// в корне репозитория.

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

export const SUPPLY_STATUSES = [
  "not_started",
  "awaiting_shipment",
  "in_transit",
  "received",
  "problem",
  "not_required",
] as const;

export const OVERALL_STATUSES = ["active", "waiting", "ready", "completed", "cancelled"] as const;
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

export const PROCESS_OPTIONS: Record<ProcessField, readonly string[]> = {
  searchConnectors: BASE_STATUSES,
  schemeDevelopment: BASE_STATUSES,
  orderConnectors: ORDER_STATUSES,
  payment: PAYMENT_STATUSES,
  supplyConnectors: SUPPLY_STATUSES,
  orderTooling: ORDER_STATUSES,
  supplyTooling: SUPPLY_STATUSES,
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

export const OVERALL_STATUS_LABELS: Record<OverallStatus, string> = {
  active: "Активен",
  waiting: "Ожидает действий",
  ready: "Готов к запуску",
  completed: "Завершён",
  cancelled: "Отменён",
};

// Тон бейджа по статусу — один словарь на все наборы значений, чтобы
// цвет был предсказуем вне зависимости от процесса.
export type StatusTone = "neutral" | "progress" | "waiting" | "done" | "problem" | "cancelled";

export const STATUS_TONE: Record<string, StatusTone> = {
  not_started: "neutral",
  in_progress: "progress",
  waiting: "waiting",
  done: "done",
  problem: "problem",
  not_required: "neutral",
  cancelled: "cancelled",
  preparing_order: "progress",
  order_placed: "done",
  awaiting_payment: "waiting",
  paid: "done",
  awaiting_shipment: "waiting",
  in_transit: "progress",
  received: "done",
  active: "progress",
  ready: "done",
  completed: "done",
};
