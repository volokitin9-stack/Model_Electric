import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { COMPONENT_STATUS_RESOLVED } from "./statuses.js";

const D = Prisma.Decimal;
export type Decimal = InstanceType<typeof D>;

/**
 * Текущая цена кроссировки — самая свежая запись SupplierPrice по
 * effectiveAt. SupplierPrice — append-only лог (каждый импорт/правка
 * добавляет строку), поэтому "текущая цена" всегда вычисляется, а не
 * хранится отдельно.
 */
export async function currentPriceForCrossReference(crossReferenceId: string) {
  return prisma.supplierPrice.findFirst({
    where: { crossReferenceId },
    orderBy: { effectiveAt: "desc" },
  });
}

export type CostResult = {
  amount: Decimal | null;
  currency: string | null;
  source: "supplier" | "planned" | "unknown";
};

/**
 * Приоритет цены позиции спецификации (см. ТЗ §7):
 * 1. Подтверждённая основная цена поставщика (status=confirmed и задан
 *    primaryOfferId, у которого есть текущая цена).
 * 2. Ранее сохранённая плановая цена.
 * 3. Неизвестно — не выдаём ноль и не считаем это окончательной ценой.
 */
export async function resolveComponentPrice(pc: {
  status: string;
  primaryOfferId: string | null;
  plannedPrice: Decimal | null;
  plannedCurrency: string | null;
}): Promise<CostResult> {
  if (pc.status === "confirmed" && pc.primaryOfferId) {
    const price = await currentPriceForCrossReference(pc.primaryOfferId);
    if (price) return { amount: price.price, currency: price.currency, source: "supplier" };
  }
  if (pc.plannedPrice != null && pc.plannedCurrency) {
    return { amount: pc.plannedPrice, currency: pc.plannedCurrency, source: "planned" };
  }
  return { amount: null, currency: null, source: "unknown" };
}

export type ProjectComponentWithCost = {
  id: string;
  status: string;
  cost: CostResult;
  lineTotal: Decimal | null;
};

/**
 * Сумма стоимости по проекту — только в разрезе валют: разные валюты
 * никогда не складываются без явного курса. Если хотя бы одна позиция
 * (не "не требуется") без известной цены — isPartial=true, и это
 * обязательно показывается в UI как "Частичная стоимость", а не как
 * итоговая себестоимость.
 */
export function summarizeCost(items: ProjectComponentWithCost[]) {
  const totalsByCurrency = new Map<string, Decimal>();
  let pricedCount = 0;
  let missingCount = 0;
  let applicableCount = 0;

  for (const item of items) {
    if (item.status === "not_required") continue;
    applicableCount++;
    if (item.lineTotal != null && item.cost.currency) {
      pricedCount++;
      const prev = totalsByCurrency.get(item.cost.currency) ?? new D(0);
      totalsByCurrency.set(item.cost.currency, prev.plus(item.lineTotal));
    } else {
      missingCount++;
    }
  }

  return {
    totalsByCurrency: Object.fromEntries(
      Array.from(totalsByCurrency.entries()).map(([c, v]) => [c, v.toFixed(2)]),
    ),
    isPartial: missingCount > 0,
    isMixedCurrency: totalsByCurrency.size > 1,
    pricedCount,
    missingCount,
    applicableCount,
  };
}

/**
 * Записывает новое наблюдение цены (SupplierPrice — append-only) и,
 * если значение реально изменилось относительно текущей (последней)
 * цены, добавляет запись в SupplierPriceHistory. Используется и ручным
 * редактированием цены, и применением импорта — единая точка истины,
 * чтобы история цен никогда не терялась.
 */
export async function recordPrice(
  crossReferenceId: string,
  input: {
    price: Decimal | number | string;
    currency: string;
    minimumOrderQuantity?: number | null;
    availability?: string | null;
    leadTimeDays?: number | null;
    sourceFileId?: string | null;
  },
) {
  const previous = await currentPriceForCrossReference(crossReferenceId);
  const newPrice = new D(input.price);

  const created = await prisma.supplierPrice.create({
    data: {
      crossReferenceId,
      price: newPrice,
      currency: input.currency,
      minimumOrderQuantity: input.minimumOrderQuantity ?? null,
      availability: input.availability ?? null,
      leadTimeDays: input.leadTimeDays ?? null,
      sourceFileId: input.sourceFileId ?? null,
    },
  });

  const changed =
    !previous || !previous.price.equals(newPrice) || previous.currency !== input.currency;
  if (changed) {
    await prisma.supplierPriceHistory.create({
      data: {
        crossReferenceId,
        oldPrice: previous?.price ?? null,
        newPrice,
        currency: input.currency,
        sourceFileId: input.sourceFileId ?? null,
      },
    });
  }

  return { price: created, changed };
}

/** % позиций спецификации в "закрывающем" статусе (не считая пустую спецификацию). */
export function computeSpecFillPercent(items: { status: string }[]): number {
  if (items.length === 0) return 0;
  const resolved = items.filter((i) =>
    (COMPONENT_STATUS_RESOLVED as readonly string[]).includes(i.status),
  ).length;
  return Math.round((resolved / items.length) * 100);
}
