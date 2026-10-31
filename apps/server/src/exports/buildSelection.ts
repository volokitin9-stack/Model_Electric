import { prisma } from "../db.js";
import { currentPriceForCrossReference } from "../pricing.js";

export type ExportRow = {
  supplierArticle: string;
  price: string;
  currency: string;
  ourArticle: string;
  componentName: string;
};

export type ExportConflict = {
  componentId: string;
  ourArticle: string;
  reason: string;
};

export type ExportSelection = {
  supplier: { id: string; code: string; name: string };
  projects: { id: string; name: string }[];
  componentCount: number;
  rows: ExportRow[];
  noPriceComponents: { ourArticle: string; componentName: string }[];
  noOfferComponents: { ourArticle: string; componentName: string }[];
  conflicts: ExportConflict[];
  duplicateSupplierArticles: string[];
  currencyBreakdown: Record<string, number>;
};

/**
 * Алгоритм выборки для выгрузки (ТЗ §12, шаг 3). Детерминированный —
 * одни и те же supplierId+projectIds всегда дают один результат,
 * поэтому предпросмотр и скачивание пересчитывают его заново на
 * сервере, не доверяя данным от клиента.
 */
export async function buildExportSelection(supplierId: string, projectIds: string[]): Promise<ExportSelection> {
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) throw Object.assign(new Error("Поставщик не найден"), { status: 404 });

  const projects = await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } });

  const components = await prisma.projectComponent.findMany({
    where: { projectId: { in: projectIds }, status: { not: "not_required" } },
    include: { component: true, primaryOffer: true },
  });

  // Группируем по комплектующему — одна позиция, даже если встречается в
  // нескольких выбранных проектах (§12: "попадёт в выгрузку один раз").
  const byComponent = new Map<string, typeof components>();
  for (const pc of components) {
    const list = byComponent.get(pc.componentId) ?? [];
    list.push(pc);
    byComponent.set(pc.componentId, list);
  }

  const rows: ExportRow[] = [];
  const noPriceComponents: ExportSelection["noPriceComponents"] = [];
  const noOfferComponents: ExportSelection["noOfferComponents"] = [];
  const conflicts: ExportConflict[] = [];
  const currencyBreakdown: Record<string, number> = {};
  const seenSupplierArticles = new Map<string, number>();

  for (const [componentId, pcs] of byComponent) {
    const component = pcs[0].component;
    const offers = await prisma.supplierCrossReference.findMany({
      where: { componentId, supplierId, status: "active" },
    });

    if (offers.length === 0) {
      noOfferComponents.push({ ourArticle: component.internalArticle, componentName: component.name });
      continue;
    }

    let chosen = offers[0];
    if (offers.length > 1) {
      // Несколько вариантов этого поставщика — нужен подтверждённый выбор
      // (ProjectComponent.status=confirmed + primaryOfferId на этого же
      // поставщика). Без него — не берём по минимальной цене молча.
      const confirmedChoices = new Set(
        pcs
          .filter((pc) => pc.status === "confirmed" && pc.primaryOfferId && offers.some((o) => o.id === pc.primaryOfferId))
          .map((pc) => pc.primaryOfferId as string),
      );
      if (confirmedChoices.size === 0) {
        conflicts.push({
          componentId, ourArticle: component.internalArticle,
          reason: `У поставщика ${offers.length} варианта(ов) артикула для этого комплектующего, основной не подтверждён в спецификации`,
        });
        continue;
      }
      if (confirmedChoices.size > 1) {
        conflicts.push({
          componentId, ourArticle: component.internalArticle,
          reason: "В разных проектах подтверждены разные предложения этого поставщика для одного комплектующего",
        });
        continue;
      }
      chosen = offers.find((o) => o.id === Array.from(confirmedChoices)[0])!;
    }

    const price = await currentPriceForCrossReference(chosen.id);
    if (!price) {
      noPriceComponents.push({ ourArticle: component.internalArticle, componentName: component.name });
      continue;
    }

    const key = chosen.supplierArticle.trim().toUpperCase();
    if (seenSupplierArticles.has(key)) {
      continue; // уже попал в выгрузку под другим нашим артикулом — не дублируем строку
    }
    seenSupplierArticles.set(key, 1);

    rows.push({
      supplierArticle: chosen.supplierArticle,
      price: price.price.toFixed(2),
      currency: price.currency,
      ourArticle: component.internalArticle,
      componentName: component.name,
    });
    currencyBreakdown[price.currency] = (currencyBreakdown[price.currency] ?? 0) + 1;
  }

  return {
    supplier: { id: supplier.id, code: supplier.code, name: supplier.name },
    projects,
    componentCount: byComponent.size,
    rows,
    noPriceComponents,
    noOfferComponents,
    conflicts,
    duplicateSupplierArticles: [],
    currencyBreakdown,
  };
}
