import type { NextFunction, Request, Response } from "express";

// Единый контур доступа ко всему /api/* — проект публично задеплоен, а
// полноценной системы пользователей пока нет (см. README →
// "Известные ограничения"). Если переменная API_KEY не задана, доступ
// не ограничивается (удобно для локальной разработки); если задана —
// каждый запрос к /api/* (кроме /api/health, который нужен хостингу
// для health-check без ключа) обязан нести заголовок x-api-key с тем
// же значением. Веб-клиент хранит ключ в localStorage после первого
// ввода (см. apps/web/src/components/api-key-gate.tsx), Local Import
// Agent передаёт его из своего локального конфига.
export function apiKeyMiddleware(req: Request, res: Response, next: NextFunction) {
  const required = process.env.API_KEY;
  if (!required) return next();

  const presented = req.header("x-api-key");
  if (presented !== required) {
    return res.status(401).json({ error: "Неверный или отсутствующий ключ доступа (x-api-key)" });
  }
  next();
}
