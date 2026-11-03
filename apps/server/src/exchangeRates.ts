import fs from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";

const D = Prisma.Decimal;

// Единственный источник курса — тот же export/price_import.json, что
// бандлится в образ для агента свода цен (см. Dockerfile и
// apps/spec-import-agent/lib/prices.js). При следующем своде цен курс
// обновится сам, без ручной настройки где-либо ещё. В проде файл лежит
// по абсолютному пути /export/price_import.json (см. Dockerfile), в
// локальной разработке — рядом в репозитории.
const PROD_PATH = "/export/price_import.json";
const DEV_PATH = path.resolve(process.cwd(), "..", "..", "export", "price_import.json");

type RateInfo = { currency: string; rubPerUnit: InstanceType<typeof D>; rate: number; coef: number; generatedAt: string };

let cached: RateInfo | null | undefined;

function load(): RateInfo | null {
  if (cached !== undefined) return cached;
  for (const p of [PROD_PATH, DEV_PATH]) {
    try {
      if (!fs.existsSync(p)) continue;
      const data = JSON.parse(fs.readFileSync(p, "utf8"));
      if (data.currency && data.rate && data.coef) {
        cached = {
          currency: data.currency,
          rubPerUnit: new D(data.rate).times(data.coef),
          rate: data.rate,
          coef: data.coef,
          generatedAt: data.generatedAt,
        };
        return cached;
      }
    } catch {
      // пробуем следующий путь
    }
  }
  cached = null;
  return null;
}

export function getRateInfo(): RateInfo | null {
  return load();
}

/**
 * Переводит сумму в рубли по известному курсу. RUB конвертируется сам
 * в себя. Для валюты, по которой курса нет (ни разу не было свода цен,
 * либо валюта другая) — возвращает null, вызывающий код обязан явно
 * показать это как "курс неизвестен", а не домыслить конверсию.
 */
export function rubEquivalent(
  amount: InstanceType<typeof D>,
  currency: string,
): { amountRub: InstanceType<typeof D>; rateLabel: string } | null {
  if (currency === "RUB") return { amountRub: amount, rateLabel: "" };
  const info = load();
  if (!info || info.currency !== currency) return null;
  return { amountRub: amount.times(info.rubPerUnit), rateLabel: `курс ${info.rate} × ${info.coef}` };
}
