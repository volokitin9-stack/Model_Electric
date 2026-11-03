# Единый образ: веб-клиент (статика) + API-сервер в одном контейнере,
# один порт, без CORS — проще для деплоя и для доступа с телефона.
# Используется на Railway/Render/любом Docker-хостинге (см. README → "Деплой").

FROM node:20-slim AS web-build
WORKDIR /app/web
COPY apps/web/package*.json ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build

FROM node:20-slim AS agent-build
WORKDIR /app/agent
COPY apps/spec-import-agent/package*.json ./
RUN npm ci --omit=dev
COPY apps/spec-import-agent/ ./

FROM node:20-slim AS server-build
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY apps/server/package*.json ./
RUN npm ci
COPY apps/server/ ./
RUN npx prisma generate
RUN npm run build

FROM node:20-slim AS runtime
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY apps/server/package*.json ./
RUN npm ci --omit=dev
COPY --from=server-build /app/server/dist ./dist
COPY --from=server-build /app/server/prisma ./prisma
COPY --from=server-build /app/server/node_modules/.prisma ./node_modules/.prisma
COPY --from=web-build /app/web/dist /web/dist

# Spec Import Agent + сами спецификации чертежей — сервер запускает
# agent.js дочерним процессом по кнопке "Обновить данные" (см.
# src/specImport.ts). Раскладка /spec-import-agent + /specs рядом с
# /app нарочно повторяет apps/spec-import-agent + specs/ в репозитории,
# чтобы относительные пути агента (specsFolder по умолчанию) работали
# без изменений — см. комментарий в apps/spec-import-agent/agent.js.
COPY --from=agent-build /app/agent /spec-import-agent
COPY specs /specs
# Свод цен поставщиков для этапа «Свод цен» агента (tools/build_upload.py →
# export/price_import.json); путь по умолчанию у агента — ../../export.
COPY export/price_import.json /export/price_import.json

# Каталог загруженных фото проектов — монтируйте сюда постоянный volume
# хостинга (Railway/Render "persistent disk"), иначе фото пропадут при
# каждом новом деплое.
RUN mkdir -p uploads

EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
