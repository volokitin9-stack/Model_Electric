import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Запускает уже проверенный apps/spec-import-agent/agent.js как дочерний
// процесс вместо повторной реализации его логики сопоставления
// проектов/каталога/спецификаций на сервере — единственный источник
// правды остаётся один (см. README → "Обновить данные из чертежей").
// Агент обращается сам к себе через loopback тем же REST API, которым
// пользуется браузер, поэтому отдельного серверного кода для
// записи в базу здесь не нужно.
const AGENT_DIR = path.resolve(process.cwd(), "..", "spec-import-agent");
const AGENT_SCRIPT = path.join(AGENT_DIR, "agent.js");
const TIMEOUT_MS = 5 * 60 * 1000;

export type SpecImportReport = {
  startedAt: string;
  apply: boolean;
  server: string;
  drawings: Array<{
    drawingNo: number;
    file: string;
    actions: string[];
    errors: string[];
    project?: { id?: string; name: string; article?: string | null };
  }>;
  totals: {
    drawings: number;
    projectsCreated: number;
    catalogCreated: number;
    catalogFilled: number;
    added: number;
    updated: number;
    extra: number;
    removed: number;
    errors: number;
    suppliersCreated?: number;
    offersCreated?: number;
    pricesUpdated?: number;
    salesUpdated?: number;
  };
  prices?: Array<{
    key: string;
    title: string;
    actions: string[];
    errors: string[];
    project?: { id?: string; name: string; article?: string | null };
  }>;
};

let running = false;

export async function runSpecImportAgent(apply: boolean): Promise<SpecImportReport> {
  if (running) {
    throw new Error("Обновление уже выполняется — дождитесь завершения предыдущего запуска");
  }
  if (!fs.existsSync(AGENT_SCRIPT)) {
    throw new Error("Spec Import Agent недоступен в этом деплое (apps/spec-import-agent не найден рядом с сервером)");
  }
  running = true;
  const reportPath = path.join(os.tmpdir(), `spec-import-${crypto.randomUUID()}.json`);
  const port = process.env.PORT || "4000";
  const args = [
    AGENT_SCRIPT,
    "--server",
    `http://127.0.0.1:${port}`,
    "--report",
    reportPath,
    ...(apply ? ["--apply"] : []),
  ];

  try {
    let stdout = "";
    let stderr = "";
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const child = spawn(process.execPath, args, { cwd: AGENT_DIR, env: process.env });
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("Агент не завершился за отведённое время (5 минут)"));
      }, TIMEOUT_MS);
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });

    if (!fs.existsSync(reportPath)) {
      const tail = (stderr || stdout).trim().slice(-2000);
      throw new Error(`Агент завершился без отчёта (код выхода ${exitCode}): ${tail || "нет вывода"}`);
    }
    const raw = await fsp.readFile(reportPath, "utf8");
    return JSON.parse(raw) as SpecImportReport;
  } finally {
    fs.rm(reportPath, { force: true }, () => {});
    running = false;
  }
}
