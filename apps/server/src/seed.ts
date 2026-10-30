import { prisma } from "./db.js";

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

async function main() {
  const existing = await prisma.project.count();
  if (existing > 0) {
    console.log(`В базе уже есть ${existing} проект(ов) — сид пропущен.`);
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

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
