# syntax=docker/dockerfile:1

# --- Build stage -----------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build
# SQL migrations are not compiled by tsc; copy them next to the compiled runner.
RUN cp -r src/db/migrations dist/db/migrations

# --- Runtime stage ---------------------------------------------------------
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

EXPOSE 8080

# Default: start the API with OpenTelemetry preloaded. Compose overrides this to
# run migrations first.
CMD ["node", "--import", "./dist/observability/instrumentation.js", "dist/main.js"]
