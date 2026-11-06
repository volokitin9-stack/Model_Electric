export const ORIGIN_VALUES = ["domestic", "foreign"] as const;
export type Origin = (typeof ORIGIN_VALUES)[number];

export const ORIGIN_LABELS: Record<Origin, string> = {
  domestic: "Отечественный",
  foreign: "Иномарка",
};

// Правило по МАСТЕР-ТЗ §6, подтверждено владельцем: отечественные —
// всё под маркой LADA (включая старое написание ВАЗ), остальное —
// иномарки. Марка берётся из первого слова названия проекта (его
// формирует и ручное создание, и агент — всегда "{Марка} {Модель} —
// проводка ТСУ"), а не произвольным совпадением где угодно в тексте.
// Значение — обычное поле Project.origin, подстановка здесь только
// задаёт значение по умолчанию при создании; дальше его можно
// поправить вручную, если классификация ошиблась.
export function classifyOrigin(projectName: string): Origin {
  const brand = projectName.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return brand === "lada" || brand === "ваз" ? "domestic" : "foreign";
}
