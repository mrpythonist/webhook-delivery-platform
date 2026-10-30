# syntax=docker/dockerfile:1

FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
# `prisma` (the CLI) is a runtime dependency so `prisma migrate deploy`
# can run on container start.
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/prisma ./prisma

# Default: run migrations, then start the API. The compose `worker` service
# overrides this command with `node dist/worker.js`.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
