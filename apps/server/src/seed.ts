import { prisma } from "./db.js";
import { recordPrice } from "./pricing.js";

// Демонстрационные данные для первого запуска — по мотивам реальных
// моделей из проекта "ТСУ-электрика", чтобы дашборд показывал
// осмысленную, а не абстрактную картину.
const projects = [
  {
    name: "Lada Vesta NG — проводка ТСУ",
    article: "ME-LADA-VESTA-NG",
    responsible: "А. Иванов",
    overallStatus: "active",
    searchConnectors: "done",
    schemeDevelopment: "in_progress",
    orderConnectors: "not_started",
    payment: "not_started",
    supplyConnectors: "not_started",
    orderTooling: "not_started",
    supplyTooling: "not_started",
    plannedDate: new Date("2026-12-15"),
  },
  {
    name: "Haval Jolion — проводка ТСУ",
    article: "ME-HAVAL-JOLION",
    responsible: "М. Петров",
    overallStatus: "active",
    searchConnectors: "done",
    schemeDevelopment: "done",
    orderConnectors: "order_placed",
    payment: "awaiting_payment",
    supplyConnectors: "not_started",
    orderTooling: "not_started",
    supplyTooling: "not_started",
    plannedDate: new Date("2026-11-20"),
  },
  {
    name: "Lada Largus 2021- — проводка ТСУ",
    article: "ME-LADA-LARGUS-21",
    responsible: "К. Сидоров",
    overallStatus: "waiting",
    searchConnectors: "problem",
    schemeDevelopment: "not_started",
    orderConnectors: "not_started",
    payment: "not_required",
    supplyConnectors: "not_required",
    orderTooling: "not_started",
    supplyTooling: "not_started",
    plannedDate: new Date("2026-11-01"),
  },
  {
    name: "Toyota Land Cruiser 200 — проводка ТСУ",
    article: "ME-TOYOTA-LC200",
    responsible: "А. Иванов",
    overallStatus: "ready",
    searchConnectors: "done",
    schemeDevelopment: "done",
    orderConnectors: "order_placed",
    payment: "paid",
    supplyConnectors: "received",
    orderTooling: "order_placed",
    supplyTooling: "received",
    plannedDate: new Date("2026-10-25"),
  },
  {
    name: "Renault Logan 2 — проводка ТСУ",
    article: "ME-RENAULT-LOGAN2",
    responsible: "М. Петров",
    overallStatus: "completed",
    searchConnectors: "done",
    schemeDevelopment: "done",
    orderConnectors: "order_placed",
    payment: "paid",
    supplyConnectors: "received",
    orderTooling: "not_required",
    supplyTooling: "not_required",
    plannedDate: new Date("2026-09-10"),
  },
  {
    name: "Volkswagen Polo 5 — проводка ТСУ",
    article: "ME-VW-POLO5",
    responsible: "К. Сидоров",
    overallStatus: "active",
    searchConnectors: "done",
    schemeDevelopment: "waiting",
    orderConnectors: "not_started",
    payment: "not_started",
    supplyConnectors: "not_started",
    orderTooling: "not_started",
    supplyTooling: "not_started",
    plannedDate: new Date("2026-10-20"),
  },
];

async function seedProjects() {
  const existing = await prisma.project.count();
  if (existing > 0) {
    console.log(`В базе уже есть ${existing} проект(ов) — сид проектов пропущен.`);
    return;
  }
  for (const p of projects) {
    const project = await prisma.project.create({ data: p as any });
    await prisma.changeLogEntry.create({
      data: {
        projectId: project.id,
        field: "project",
        fieldLabel: "Проект создан",
        oldValue: null,
        newValue: project.name,
        changedBy: "Сид начальных данных",
      },
    });
  }
  console.log(`Создано ${projects.length} демонстрационных проектов.`);
}

async function seedCatalogAndSuppliers() {
  const existing = await prisma.componentCatalog.count();
  if (existing > 0) {
    console.log(`В каталоге уже есть ${existing} комплектующих — сид каталога/поставщиков пропущен.`);
    return;
  }

  const catConnectors = await prisma.componentCategory.create({ data: { name: "Разъёмы" } });
  const catWiring = await prisma.componentCategory.create({ data: { name: "Проводка" } });

  const components = await Promise.all([
    prisma.componentCatalog.create({ data: { internalArticle: "R-10025", name: "Разъём 7-pin male", categoryId: catConnectors.id, unit: "шт" } }),
    prisma.componentCatalog.create({ data: { internalArticle: "R-10026", name: "Разъём 7-pin female", categoryId: catConnectors.id, unit: "шт" } }),
    prisma.componentCatalog.create({ data: { internalArticle: "R-10031", name: "Разъём 13-pin male", categoryId: catConnectors.id, unit: "шт" } }),
    prisma.componentCatalog.create({ data: { internalArticle: "R-20010", name: "Блок согласования электропроводки", categoryId: catWiring.id, unit: "шт" } }),
    prisma.componentCatalog.create({ data: { internalArticle: "R-20011", name: "Жгут проводки ТСУ", categoryId: catWiring.id, unit: "компл" } }),
  ]);
  console.log(`Создано ${components.length} комплектующих в каталоге.`);

  const suppliers = await Promise.all([
    prisma.supplier.create({ data: { code: "SUP01", name: "Концепт Авто", country: "Россия", defaultCurrency: "RUB", email: "sales@concept-auto.example" } }),
    prisma.supplier.create({ data: { code: "SUP02", name: "Ylcn", country: "Китай", defaultCurrency: "CNY", messenger: "WeChat: ylcn_sales" } }),
    prisma.supplier.create({ data: { code: "SUP03", name: "HD Connector", country: "Китай", defaultCurrency: "CNY" } }),
  ]);
  console.log(`Создано ${suppliers.length} поставщиков.`);

  const [sup01, sup02, sup03] = suppliers;
  const [c25, c26, c31, c20010, c20011] = components;

  async function addOffer(supplierId: string, componentId: string, supplierArticle: string, price: number, currency: string, isPrimary = false) {
    const xref = await prisma.supplierCrossReference.create({
      data: { supplierId, componentId, supplierArticle, isPrimary, source: "manual" },
    });
    await recordPrice(xref.id, { price, currency, availability: "yes" });
    return xref;
  }

  const offer1 = await addOffer(sup01.id, c25.id, "AX-1250", 210, "RUB");
  await addOffer(sup02.id, c25.id, "7021K-0.6-11", 0.77, "CNY");
  await addOffer(sup01.id, c26.id, "AX-1251", 230, "RUB");
  const offer3 = await addOffer(sup03.id, c31.id, "HD0616Y-1.8-11J", 1.12, "CNY");
  await addOffer(sup01.id, c20010.id, "KA-SC71", 1850, "RUB");
  await addOffer(sup01.id, c20011.id, "KA-WH-07", 3200, "RUB");

  // Вторая, более новая цена у offer1 — чтобы в истории цены было реальное изменение.
  await recordPrice(offer1.id, { price: 225, currency: "RUB", availability: "yes" });

  const allProjects = await prisma.project.findMany({ orderBy: { createdAt: "asc" } });
  if (allProjects.length >= 2) {
    const [p1, p2] = allProjects;
    await prisma.projectComponent.create({
      data: { projectId: p1.id, componentId: c25.id, quantity: 2, status: "confirmed", primaryOfferId: offer1.id },
    });
    await prisma.projectComponent.create({
      data: { projectId: p1.id, componentId: c26.id, quantity: 2, status: "searching" },
    });
    await prisma.projectComponent.create({
      data: { projectId: p1.id, componentId: c20010.id, quantity: 1, status: "not_defined" },
    });
    await prisma.projectComponent.create({
      data: { projectId: p2.id, componentId: c31.id, quantity: 1, status: "confirmed", primaryOfferId: offer3.id },
    });
    await prisma.projectComponent.create({
      data: { projectId: p2.id, componentId: c20011.id, quantity: 1, status: "not_required" },
    });
    await prisma.projectCompetitor.create({
      data: {
        projectId: p1.id,
        sellerName: "Фирма Концепт Авто",
        productName: `${p1.name} — проводка ТСУ`,
        productUrl: "https://www.ozon.ru/product/1653296290",
        price: 7636,
        currency: "RUB",
        comment: "Топ-продавец по данным маркетплейса на момент проверки",
      },
    });
    console.log(`Заполнена спецификация для проектов "${p1.name}" и "${p2.name}".`);
  }
}

async function main() {
  await seedProjects();
  await seedCatalogAndSuppliers();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
