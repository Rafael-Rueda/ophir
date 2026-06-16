# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Ophir Observability Hub - production image.
# All runtime configuration is provided via environment variables; no secrets
# are baked into the image (see .dockerignore + .env handling).
# ---------------------------------------------------------------------------

# --- Build stage -----------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build \
    # SQL migrations are not compiled by tsc; ship them beside the runner.
    && cp -r src/db/migrations dist/db/migrations

# --- Runtime stage ---------------------------------------------------------
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080

# Production dependencies only.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh ./docker-entrypoint.sh
# Normalize line endings (Windows hosts may produce CRLF) and make executable.
RUN sed -i 's/\r$//' ./docker-entrypoint.sh && chmod +x ./docker-entrypoint.sh && chown -R node:node /app

# Run as the unprivileged built-in node user.
USER node

EXPOSE 8080

# Liveness check using Node's global fetch (no extra tooling needed).
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

LABEL org.opencontainers.image.title="Ophir Observability Hub" \
      org.opencontainers.image.description="Secure observability gateway and control plane that authenticates source apps and forwards OTLP logs/traces/metrics to an OpenTelemetry Collector." \
      org.opencontainers.image.licenses="UNLICENSED"

# Entrypoint runs migrations (optional) then starts the API with OTel preload.
ENTRYPOINT ["./docker-entrypoint.sh"]
