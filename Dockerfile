# Единый образ: веб-клиент (статика) + API-сервер в одном контейнере,
# один порт, без CORS — проще для деплоя и для доступа с телефона.
# Используется на Railway/Render/любом Docker-хостинге (см. README → "Деплой").

FROM node:20-slim AS web-build
WORKDIR /app/web
COPY apps/web/package*.json ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build

FROM node:20-slim AS server-build
WORKDIR /app/server
COPY apps/server/package*.json ./
RUN npm ci
COPY apps/server/ ./
RUN npx prisma generate
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY apps/server/package*.json ./
RUN npm ci --omit=dev
COPY --from=server-build /app/server/dist ./dist
COPY --from=server-build /app/server/prisma ./prisma
COPY --from=server-build /app/server/node_modules/.prisma ./node_modules/.prisma
COPY --from=web-build /app/web/dist /web/dist

# Каталог загруженных фото проектов — монтируйте сюда постоянный volume
# хостинга (Railway/Render "persistent disk"), иначе фото пропадут при
# каждом новом деплое.
RUN mkdir -p uploads

EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
