#!/usr/bin/env node
/**
 * Local Import Agent — читает прайс-листы поставщиков из локальной
 * папки на компьютере пользователя и отправляет их в API «Модельной
 * электрики» тем же путём, что и загрузка файла из браузера
 * (POST /api/imports/preview). Существует отдельно от сервера, потому
 * что сам сервер работает в облаке/на другой машине и физически не
 * имеет доступа к диску C:\ пользователя (см. ТЗ §14).
 *
 * Запуск:  node agent.js [--confirm] [--config путь/к/config.json]
 *
 * Без --confirm агент только присылает предпросмотр (новые кроссировки/
 * изменения цены/ошибки) и ничего не меняет в базе — применение
 * (подтверждение) делается отдельно, вручную, на странице поставщика
 * в вебе, либо явным флагом --confirm здесь (ТЗ §17: "пользователь
 * подтверждает обновление" — шаг обязателен, этот флаг — осознанный
 * выбор того, кто запускает агент).
 *
 * Структура папок (ТЗ §15), код подпапки = код поставщика в системе:
 *   <rootFolder>/
 *     SUP01/
 *       price.xlsx
 *       cross.xlsx
 *     SUP02/
 *       ...
 *
 * Для каждого поставщика должен быть заранее создан хотя бы один
 * SupplierImportProfile (через веб-интерфейс, вкладка «Поставщики» →
 * карточка поставщика → «Настроить импорт») — агент сам схему колонок
 * не придумывает (это сознательно: нечёткое сопоставление колонок —
 * предложение для человека, не то, что сохраняется автоматически,
 * см. ТЗ §18).
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ALLOWED_EXTENSIONS_DEFAULT = [".xlsx", ".xls", ".csv"];
const MAX_FILE_BYTES = 15 * 1024 * 1024;

function parseArgs(argv) {
  const args = { confirm: false, configPath: path.join(path.dirname(new URL(import.meta.url).pathname), "config.json") };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--confirm") args.confirm = true;
    else if (argv[i] === "--config") args.configPath = argv[++i];
    else if (argv[i] === "--supplier") args.onlySupplier = argv[++i];
  }
  return args;
}

function loadConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    console.error(
      `Файл конфигурации не найден: ${configPath}\n` +
        `Скопируйте config.example.json в config.json и укажите rootFolder/serverUrl/agentToken.`,
    );
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (!raw.rootFolder || typeof raw.rootFolder !== "string") {
    console.error("В config.json не задан rootFolder — путь жёстко в коде не фиксируется (ТЗ §15).");
    process.exit(1);
  }
  if (!fs.existsSync(raw.rootFolder)) {
    console.error(`Папка rootFolder не существует: ${raw.rootFolder}`);
    process.exit(1);
  }
  return {
    serverUrl: raw.serverUrl || "http://localhost:4000",
    agentToken: raw.agentToken || "",
    rootFolder: raw.rootFolder,
    fileExtensions: raw.fileExtensions || ALLOWED_EXTENSIONS_DEFAULT,
  };
}

function authHeaders(config) {
  // Канал считается "защищённым" в меру того, что вообще есть у
  // приложения на этом этапе — токен передаётся отдельным заголовком,
  // а не как часть URL/лога. Полноценная авторизация пользователей в
  // системе пока не реализована (см. README корня репозитория,
  // раздел "Известные ограничения") — агент honestly наследует то же
  // ограничение, а не имитирует более сильную защиту, чем есть.
  return config.agentToken ? { "x-agent-token": config.agentToken } : {};
}

async function apiGet(config, pathname) {
  const res = await fetch(`${config.serverUrl}${pathname}`, { headers: authHeaders(config) });
  if (!res.ok) throw new Error(`GET ${pathname} -> ${res.status}`);
  return res.json();
}

async function apiPostJson(config, pathname, body) {
  const res = await fetch(`${config.serverUrl}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(config) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `POST ${pathname} -> ${res.status}`);
  return data;
}

async function uploadForPreview(config, { supplierId, profileId, filePath }) {
  const bytes = fs.readFileSync(filePath);
  const blob = new Blob([bytes]);
  const form = new FormData();
  form.append("file", blob, path.basename(filePath));
  form.append("supplierId", supplierId);
  form.append("profileId", profileId);

  const res = await fetch(`${config.serverUrl}/api/imports/preview`, {
    method: "POST",
    headers: authHeaders(config),
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `POST /api/imports/preview -> ${res.status}`);
  return data;
}

function printDiffSummary(file, result) {
  console.log(`\n  ${path.basename(file)}`);
  if (result.alreadyImported) {
    console.log("    без изменений с прошлого раза — пропущено");
    return;
  }
  const c = result.diff.counts;
  console.log(
    `    новых кроссировок: ${c.newLinks} · изменений цены: ${c.priceUpdates} · без изменений: ${c.noChange} · ` +
      `неизвестных артикулов: ${c.unknownArticles} · без привязки: ${c.orphanPrices} · ` +
      `дублей: ${c.duplicates} · ошибок: ${c.errors}`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig(args.configPath);

  console.log(`Local Import Agent — папка: ${config.rootFolder}`);
  console.log(args.confirm ? "Режим: предпросмотр + подтверждение" : "Режим: только предпросмотр (без --confirm изменения не применяются)");

  const entries = fs.readdirSync(config.rootFolder, { withFileTypes: true }).filter((e) => e.isDirectory());
  if (entries.length === 0) {
    console.log("В корневой папке нет подпапок поставщиков — нечего импортировать.");
    return;
  }

  for (const entry of entries) {
    const supplierCode = entry.name;
    if (args.onlySupplier && args.onlySupplier !== supplierCode) continue;

    let supplier;
    try {
      const suppliers = await apiGet(config, `/api/suppliers`);
      supplier = suppliers.find((s) => s.code === supplierCode);
    } catch (e) {
      console.error(`Не удалось получить список поставщиков: ${e.message}`);
      return;
    }
    if (!supplier) {
      console.warn(`Папка "${supplierCode}" не соответствует коду ни одного поставщика в системе — пропущена.`);
      continue;
    }

    const profiles = await apiGet(config, `/api/imports/profiles?supplierId=${supplier.id}`);
    const profile = profiles.find((p) => p.localSourceKey === supplierCode) || profiles[0];
    if (!profile) {
      console.warn(
        `Для поставщика ${supplierCode} (${supplier.name}) не настроен шаблон импорта — ` +
          `настройте его в веб-интерфейсе (карточка поставщика → «Настроить импорт»), иначе агент не знает, какие колонки читать.`,
      );
      continue;
    }

    const folderPath = path.join(config.rootFolder, entry.name);
    const files = fs
      .readdirSync(folderPath, { withFileTypes: true })
      .filter((f) => f.isFile() && config.fileExtensions.includes(path.extname(f.name).toLowerCase()))
      .map((f) => path.join(folderPath, f.name));

    if (files.length === 0) {
      console.log(`\n${supplierCode} (${supplier.name}): файлов не найдено`);
      continue;
    }

    console.log(`\n${supplierCode} (${supplier.name}) — профиль "${profile.profileName}", файлов: ${files.length}`);

    for (const filePath of files) {
      const stat = fs.statSync(filePath);
      if (stat.size > MAX_FILE_BYTES) {
        console.warn(`  ${path.basename(filePath)}: пропущен — больше 15 МБ`);
        continue;
      }
      try {
        const result = await uploadForPreview(config, { supplierId: supplier.id, profileId: profile.id, filePath });
        printDiffSummary(filePath, result);

        if (args.confirm && !result.alreadyImported) {
          const applied = await apiPostJson(config, `/api/imports/${result.batchId}/confirm`, {});
          console.log(`    применено: создано ${applied.rowsCreated}, обновлено ${applied.rowsUpdated}, отклонено ${applied.rowsRejected}`);
        } else if (!result.alreadyImported) {
          console.log(`    для применения: откройте «Поставщики → ${supplier.name} → История обновлений» и подтвердите пакет, либо перезапустите агент с --confirm`);
        }
      } catch (e) {
        console.error(`  ${path.basename(filePath)}: ошибка — ${e.message}`);
      }
    }
  }
}

main().catch((e) => {
  console.error("Критическая ошибка агента:", e);
  process.exit(1);
});
