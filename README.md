# Ophir Observability Hub

Ophir is a secure **observability gateway and control plane**. External applications send OTLP-compatible logs, traces, and metrics to Ophir. Ophir authenticates each source, records routing/audit metadata, and forwards telemetry to an OpenTelemetry Collector, which routes each signal to a specialized backend:

- **Logs** → Loki
- **Traces** → Tempo
- **Metrics** → Prometheus
- **Visualization** → Grafana (primary UI)

Ophir is **not** a long-term telemetry database. Its PostgreSQL database stores only control-plane data: admin users, the source registry, hashed credentials, integration health, dashboard links, redaction/routing policy, and audit events.

> Spec & design: [`specs/001-ophir-observability-hub/`](specs/001-ophir-observability-hub/) (spec, plan, data model, contracts, tasks).

## Architecture

```text
External apps
  |  OTLP/HTTP + x-ophir-source-key
  v
Ophir API (Node.js + Fastify)
  |  authenticate source -> validate route -> audit -> forward
  v
OpenTelemetry Collector
  |---- logs ----> Loki
  |---- traces --> Tempo
  |---- metrics -> Prometheus
                    ^
Grafana reads Loki + Tempo + Prometheus and shows dashboards to admins
```

Ophir also observes itself: Pino JSON logs, OpenTelemetry traces around key operations, and metrics (ingestion counts, forward latency, rejections) exported through the same Collector.

## Quickstart

### Prerequisites

- Node.js 24 LTS (works on Node 22+), npm
- Docker Desktop (for the local stack)

### 1. Install dependencies

```powershell
npm install
```

### 2. Start the local observability stack

```powershell
docker compose -f infra/docker-compose.yml up -d
```

This launches PostgreSQL, the OpenTelemetry Collector, Loki, Tempo, Prometheus, Grafana, and the Ophir API (built from the `Dockerfile`).

### 3. Run database migrations (for local, non-Docker runs)

```powershell
copy .env.example .env   # then edit as needed
npm run db:migrate
```

> In Docker, migrations run automatically before the API starts.

### 4. Create an admin

```powershell
npm run admin:create -- admin@example.com "local-development-password" "Local Admin"
```

### 5. Run Ophir locally (outside Docker)

```powershell
npm run dev
```

The API listens on `http://localhost:8080`.

> Self-instrumentation (Ophir exporting its own traces/metrics) is enabled in the compiled/Docker runtime via the OpenTelemetry preload (`npm start` / the container). It is intentionally **not** preloaded under `tsx` in `npm run dev` because the OpenTelemetry ESM hook conflicts with tsx's on-the-fly `.ts` resolution. Set `OTEL_SDK_DISABLED=false` and run the compiled build to exercise it locally.

### Local service URLs

| Service                | URL                       |
| ---------------------- | ------------------------- |
| Ophir API              | http://localhost:8080     |
| Grafana                | http://localhost:1234     |
| OpenTelemetry Collector| http://localhost:4318     |
| Prometheus             | http://localhost:9090     |
| Loki                   | http://localhost:3100     |
| Tempo                  | http://localhost:3200     |
| PostgreSQL             | localhost:5442            |

## API Overview

| Method & Path                          | Auth         | Description                                   |
| -------------------------------------- | ------------ | --------------------------------------------- |
| `GET /health/live`                     | none         | Liveness probe                                |
| `GET /health/ready`                    | none         | Readiness (DB) + integration health snapshot  |
| `POST /v1/auth/login`                  | none         | Admin login → JWT access token                |
| `GET /v1/me`                           | admin bearer | Current admin identity                        |
| `GET /v1/sources`                      | admin bearer | List source applications                      |
| `POST /v1/sources`                     | admin bearer | Register a source application                 |
| `GET /v1/sources/:sourceId`            | admin bearer | Get a source application                      |
| `PATCH /v1/sources/:sourceId`          | admin bearer | Update a source application                   |
| `POST /v1/sources/:sourceId/credentials` | admin bearer | Create a source key (returned once)         |
| `GET /v1/integrations`                 | admin bearer | Integration list + current health             |
| `GET /v1/dashboard-links`              | admin bearer | Protected Grafana dashboard links             |
| `POST /otel/v1/logs`                   | source key   | Ingest OTLP logs (forwarded to Collector)     |
| `POST /otel/v1/traces`                 | source key   | Ingest OTLP traces                            |
| `POST /otel/v1/metrics`                | source key   | Ingest OTLP metrics                           |

Source apps authenticate with the `x-ophir-source-key` header. Admins use `Authorization: Bearer <jwt>`. Full contract: [`specs/001-ophir-observability-hub/contracts/openapi.yaml`](specs/001-ophir-observability-hub/contracts/openapi.yaml).

## Configuration

Configuration is environment-driven and validated with zod at startup. See [`.env.example`](.env.example) for the full list. Key variables:

| Variable                  | Default                                      | Purpose                                   |
| ------------------------- | -------------------------------------------- | ----------------------------------------- |
| `PORT` / `HOST`           | `8080` / `0.0.0.0`                            | API bind address                          |
| `DATABASE_URL`            | `postgres://ophir:ophir@localhost:5442/ophir`| Control-plane PostgreSQL                   |
| `JWT_SECRET`              | dev placeholder (≥32 chars)                   | Admin session signing (set in production) |
| `COLLECTOR_OTLP_HTTP_URL` | `http://localhost:4318`                       | OTLP forward target                       |
| `GRAFANA_PUBLIC_URL`      | `http://localhost:1234`                       | Browser URL used in dashboard links       |
| `OTEL_SDK_DISABLED`       | `false`                                       | Disable Ophir self-instrumentation        |

## Testing

```powershell
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest (unit + contract; integration auto-skips without the stack)
```

- **Unit** tests (`tests/unit`): redaction policy, routing policy, source-key auth, audit, password/JWT — no external dependencies.
- **Contract** tests (`tests/contract`): Fastify `inject()` against admin and OTLP endpoints (auth/validation paths run without a database).
- **Integration** tests (`tests/integration`): full telemetry flow, integration health, and auth/RBAC. These automatically **skip** unless PostgreSQL (and, for the flow test, the Collector) are reachable, so `npm test` is green locally and exercises the stack in CI/Docker.

## 📦 Dependencies & Technologies

### **Core Runtime Dependencies**

| Package | Version | Purpose | Documentation |
|---------|---------|---------|---------------|
| `fastify` | ^5.2.0 | HTTP server, routing, lifecycle hooks, schema validation | [docs](https://fastify.dev/docs/latest/) |
| `pino` | ^9.5.0 | Structured JSON logging (Fastify logger) | [docs](https://getpino.io/) |
| `zod` | ^3.24.1 | Environment, request, and domain validation | [docs](https://zod.dev/) |
| `jose` | ^5.9.6 | Admin JWT signing and verification (HS256) | [docs](https://github.com/panva/jose) |
| `pg` | ^8.13.1 | PostgreSQL client for control-plane data | [docs](https://node-postgres.com/) |

### **Observability (OpenTelemetry)**

| Package | Version | Purpose | Documentation |
|---------|---------|---------|---------------|
| `@opentelemetry/api` | ^1.9.1 | Tracing/metrics API for custom spans and counters | [docs](https://opentelemetry.io/docs/languages/js/) |
| `@opentelemetry/sdk-node` | ^0.219.0 | Node SDK bootstrap for self-instrumentation | [docs](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/) |
| `@opentelemetry/sdk-metrics` | ^2.8.0 | Periodic metric reader | [docs](https://opentelemetry.io/docs/languages/js/) |
| `@opentelemetry/resources` | ^2.8.0 | Resource attributes | [docs](https://opentelemetry.io/docs/languages/js/) |
| `@opentelemetry/semantic-conventions` | ^1.41.1 | Standard attribute keys | [docs](https://opentelemetry.io/docs/specs/semconv/) |
| `@opentelemetry/auto-instrumentations-node` | ^0.77.0 | Standard Node auto-instrumentation bundle | [docs](https://github.com/open-telemetry/opentelemetry-js-contrib) |
| `@opentelemetry/instrumentation-fastify` | ^0.57.0 | Fastify route tracing | [docs](https://github.com/open-telemetry/opentelemetry-js-contrib) |
| `@opentelemetry/exporter-trace-otlp-http` | ^0.219.0 | OTLP/HTTP trace exporter | [docs](https://opentelemetry.io/docs/languages/js/exporters/) |
| `@opentelemetry/exporter-metrics-otlp-http` | ^0.219.0 | OTLP/HTTP metric exporter | [docs](https://opentelemetry.io/docs/languages/js/exporters/) |
| `@opentelemetry/exporter-logs-otlp-http` | ^0.219.0 | OTLP/HTTP log exporter | [docs](https://opentelemetry.io/docs/languages/js/exporters/) |

### **Development Dependencies**

| Package | Version | Purpose | Documentation |
|---------|---------|---------|---------------|
| `typescript` | ^5.7.2 | Type system and compiler | [docs](https://www.typescriptlang.org/docs/) |
| `tsx` | ^4.19.2 | Run TypeScript directly (dev, scripts, migrations) | [docs](https://tsx.is/) |
| `@types/node` | ^22.10.2 | Node.js type definitions | [docs](https://www.npmjs.com/package/@types/node) |
| `@types/pg` | ^8.11.10 | PostgreSQL client type definitions | [docs](https://www.npmjs.com/package/@types/pg) |
| `pino-pretty` | ^13.0.0 | Human-readable dev log output | [docs](https://github.com/pinojs/pino-pretty) |

### **Code Quality & Linting**

| Package | Version | Purpose | Documentation |
|---------|---------|---------|---------------|
| `eslint` | ^9.17.0 | Linting | [docs](https://eslint.org/docs/latest/) |
| `@eslint/js` | ^9.17.0 | ESLint recommended JS rules | [docs](https://eslint.org/docs/latest/use/configure/) |
| `typescript-eslint` | ^8.18.1 | TypeScript ESLint integration | [docs](https://typescript-eslint.io/) |
| `prettier` | ^3.4.2 | Code formatting | [docs](https://prettier.io/docs/en/) |

### **Testing Framework**

| Package | Version | Purpose | Documentation |
|---------|---------|---------|---------------|
| `vitest` | ^2.1.8 | Unit, contract, and integration test runner | [docs](https://vitest.dev/) |

### **Infrastructure (Docker images)**

| Service | Image | Purpose | Documentation |
|---------|-------|---------|---------------|
| PostgreSQL | `postgres:16-alpine` | Control-plane database | [docs](https://hub.docker.com/_/postgres) |
| OpenTelemetry Collector | `otel/opentelemetry-collector-contrib:latest` | Telemetry routing/redaction/export | [docs](https://opentelemetry.io/docs/collector/) |
| Loki | `grafana/loki:latest` | Log storage | [docs](https://grafana.com/docs/loki/latest/) |
| Tempo | `grafana/tempo:latest` | Trace storage | [docs](https://grafana.com/docs/tempo/latest/) |
| Prometheus | `prom/prometheus:latest` | Metric storage | [docs](https://prometheus.io/docs/) |
| Grafana | `grafana/grafana:latest` | Visualization | [docs](https://grafana.com/docs/grafana/latest/) |

> For reproducible deployments, pin the observability image tags to specific versions.

### **Requirements**

- **Node.js**: `>=22.0.0` (24 LTS recommended)
- **Package Manager**: npm (bundled with Node.js)
- **Docker**: Docker Desktop / Engine with Compose v2

## Security Notes

- Source keys are stored as SHA-256 hashes; plaintext is shown only once at creation.
- Admin passwords are hashed with scrypt; sessions are JWT-backed and validated against the database.
- Disabled sources and disabled credentials cannot ingest telemetry.
- Denied ingestion and denied admin viewing always create audit events.
- Known sensitive attributes are dropped in the Collector pipeline and redacted from anything Ophir stores (e.g. audit metadata).
- Do not expose Grafana publicly without its own authentication or a trusted network boundary.

## License

UNLICENSED — internal template project.
