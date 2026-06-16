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

Configuration is environment-driven and validated with zod at startup. See [`.env.example`](.env.example) for the full list, or the [complete Docker env-var reference](#environment-variables--complete-reference-rafaelruedaophirlatest) for every variable the `rafaelrueda/ophir:latest` container accepts. Key variables:

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

## Docker Delivery & Deployment

Ophir ships in two flavors. **No secrets are baked into either image** — all configuration is provided at runtime via environment variables.

| Flavor | Image | What it contains | Postgres | Use when |
| --- | --- | --- | --- | --- |
| **Multi-service** | `Dockerfile` → `ophir:*` | Ophir API only, orchestrated with separate Grafana/Loki/Tempo/Prometheus/Collector/Postgres containers via `infra/docker-compose.yml` | bundled service | You want each component to scale/restart independently |
| **All-in-one** | `Dockerfile.allinone` → `ophir-allinone:*` | A single container with the Ophir API **plus** Grafana + Loki + Tempo + Prometheus + OpenTelemetry Collector | **external** (via `DATABASE_URL`) | You want the whole stack from one container/one command |

### Multi-service delivery

#### 1. Configure (no secrets in git)

```powershell
copy infra\.env.example infra\.env
# edit infra/.env: set JWT_SECRET (>=32 chars), POSTGRES_PASSWORD, GRAFANA_ADMIN_PASSWORD, OPHIR_IMAGE, ...
```

`infra/.env` is gitignored. Only `infra/.env.example` (placeholders) is committed.

#### 2. Build & push the image

```powershell
# build + tag (you run the final push)
./infra/build-and-push.ps1 -Image ghcr.io/your-org/ophir:1.0.0
# build + push in one go
./infra/build-and-push.ps1 -Image ghcr.io/your-org/ophir:1.0.0 -Push
```

Equivalent manual commands:

```powershell
docker build -t ghcr.io/your-org/ophir:1.0.0 .
docker push ghcr.io/your-org/ophir:1.0.0
```

#### 3. Run the full stack

```powershell
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d
```

To deploy on another host, ship the `infra/` folder (compose + service configs) and set `OPHIR_IMAGE` to your pushed image; consumers `pull` instead of `build`.

### All-in-one delivery (single container)

One image, one command — the entire stack (Ophir API + Grafana + Loki + Tempo + Prometheus + OpenTelemetry Collector) supervised inside a single container, built on the official `grafana/otel-lgtm` base. **PostgreSQL is external**: provide `DATABASE_URL` and the container fails fast if it is missing.

#### Build & push

```powershell
./infra/build-and-push.ps1 -AllInOne -Image rafaelrueda/ophir:latest
./infra/build-and-push.ps1 -AllInOne -Image rafaelrueda/ophir:latest -Push
# equivalent: docker build -f Dockerfile.allinone -t rafaelrueda/ophir:latest .
```

#### Run (docker run)

```bash
docker run -d --name ophir \
  -p 8080:8080 -p 3000:3000 \
  -e DATABASE_URL="postgres://user:pass@your-db-host:5432/ophir" \
  -e JWT_SECRET="a-long-random-secret-at-least-32-characters" \
  -e GRAFANA_ADMIN_PASSWORD="change-me" \
  -e BOOTSTRAP_ADMIN_EMAIL="admin@example.com" \
  -e BOOTSTRAP_ADMIN_PASSWORD="change-me-min-12" \
  -v ophir-data:/data \
  rafaelrueda/ophir:latest
```

#### Run (compose)

A consumer-ready example lives at `infra/docker-compose.example.yml` with its own env template:

```powershell
copy infra\.env.allinone.example .env
# edit .env: OPHIR_IMAGE, DATABASE_URL, JWT_SECRET, GRAFANA_ADMIN_PASSWORD, ...
docker compose -f infra/docker-compose.example.yml --env-file .env up -d
```

Then open the Ophir API at `http://localhost:8080` and Grafana at `http://localhost:3000` (login required).

- **Ports:** only `8080` (Ophir API) and `3000` (Grafana) are published; the internal stack talks over `localhost` inside the container. External apps send telemetry **through Ophir** (`:8080/otel`), so OTLP `4317/4318` stay internal (expose them only if an app must hit the collector directly).
- **Persistence:** all bundled state lives under `/data` (`/data/grafana`, `/data/loki`, `/data/tempo`, `/data/prometheus`) — mount a volume there to persist across restarts, or omit it for an ephemeral demo.
- **Provisioning:** Grafana ships with Loki/Tempo/Prometheus datasources and the Ophir overview dashboard pre-provisioned.

### Environment variables — complete reference (`rafaelrueda/ophir:latest`)

Every setting the all-in-one image understands. All are optional **except `DATABASE_URL`** (the container exits immediately if it is missing). Defaults shown are the *effective* values inside the all-in-one container. Inside the container the Ophir API listens on `PORT` (`8080`) and Grafana on `3000`; map them to host ports with `-p` (docker run) or the compose `*_PORT` vars.

**Minimal recommended set:**

```bash
-e DATABASE_URL="postgres://user:pass@db-host:5432/ophir"   # required
-e JWT_SECRET="<random string, >= 32 chars>"                # strongly recommended
-e GRAFANA_ADMIN_PASSWORD="<grafana admin password>"        # strongly recommended
-e GRAFANA_PUBLIC_URL="https://grafana.example.com"         # set to your real URL
-e BOOTSTRAP_ADMIN_EMAIL="admin@example.com"                # optional: first admin
-e BOOTSTRAP_ADMIN_PASSWORD="<password, >= 12 chars>"       # optional: first admin
```

#### Required & strongly recommended

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | ✅ Yes | — (boot fails if unset) | External PostgreSQL connection string for Ophir's control plane, e.g. `postgres://user:pass@host:5432/ophir`. Supports `?sslmode=require`. |
| `JWT_SECRET` | ⚠️ Strongly | insecure dev default | HMAC secret signing admin session JWTs. **Use a random value ≥ 32 chars.** |
| `GRAFANA_ADMIN_PASSWORD` | ⚠️ Strongly | `admin` | Password for the Grafana admin user (login is enforced). |
| `BOOTSTRAP_ADMIN_EMAIL` | Optional | empty | If set together with the password, auto-creates the first Ophir admin on startup. |
| `BOOTSTRAP_ADMIN_PASSWORD` | Optional | empty | First admin password (≥ 12 chars). |
| `BOOTSTRAP_ADMIN_NAME` | Optional | empty | First admin display name. |

#### Server runtime

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `production` | Node environment (`production` / `development` / `test`). |
| `HOST` | `0.0.0.0` | Ophir API bind address inside the container. |
| `PORT` | `8080` | Ophir API port inside the container. |
| `LOG_LEVEL` | `info` | Pino level: `fatal` / `error` / `warn` / `info` / `debug` / `trace` / `silent`. |
| `RUN_MIGRATIONS` | `true` | Run DB migrations on startup; set `false` to skip (e.g. read-replica boots). |

#### Database (control plane)

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — (required) | See above. |
| `DATABASE_POOL_MAX` | `10` | Maximum PostgreSQL pool connections. |

#### Admin authentication (JWT sessions)

| Variable | Default | Purpose |
| --- | --- | --- |
| `JWT_SECRET` | insecure dev default | See above — set in production. |
| `JWT_ISSUER` | `ophir` | JWT `iss` claim. |
| `JWT_AUDIENCE` | `ophir-admin` | JWT `aud` claim. |
| `ACCESS_TOKEN_TTL_SECONDS` | `3600` | Admin session token lifetime, in seconds. |

#### Source ingestion (apps → Ophir)

| Variable | Default | Purpose |
| --- | --- | --- |
| `SOURCE_KEY_PREFIX` | `ophir_src_` | Prefix for generated source ingestion keys. |
| `COLLECTOR_OTLP_HTTP_URL` | `http://127.0.0.1:4318` | OTLP/HTTP endpoint Ophir forwards accepted telemetry to (the bundled collector). |
| `COLLECTOR_FORWARD_TIMEOUT_MS` | `5000` | Timeout (ms) when forwarding to the collector. |

#### Ophir self-observability (OpenTelemetry SDK)

| Variable | Default | Purpose |
| --- | --- | --- |
| `OTEL_SDK_DISABLED` | `false` | Set `true` to disable Ophir emitting its own traces/metrics. |
| `OTEL_SERVICE_NAME` | `ophir` | Service name used for Ophir's own telemetry. |

> Standard OpenTelemetry SDK variables (e.g. `OTEL_RESOURCE_ATTRIBUTES`) are also honored by the Ophir process. Note: `OTEL_EXPORTER_OTLP_ENDPOINT` is pinned to the local collector for Ophir's own SDK; at the container level it instead drives the bundled collector's external fan-out (see "Bundled stack — advanced").

#### Internal stack wiring & health probes (auto-managed)

The entrypoint points these at the in-container stack on `localhost`. Override only if you externalize a component or want to tune probes. **`GRAFANA_PUBLIC_URL` is the one you usually set** so dashboard deep links resolve to your real Grafana URL.

| Variable | Default | Purpose |
| --- | --- | --- |
| `GRAFANA_PUBLIC_URL` | `http://localhost:3000` | Browser-facing Grafana base URL used to build clickable dashboard links. Set to your real external URL. |
| `GRAFANA_URL` | `http://127.0.0.1:3000` | Internal Grafana URL probed for health. |
| `COLLECTOR_URL` | `http://127.0.0.1:13133` | Collector health endpoint (`/ready`). |
| `LOKI_URL` | `http://127.0.0.1:3100` | Loki base URL (health). |
| `TEMPO_URL` | `http://127.0.0.1:3200` | Tempo base URL (health). |
| `PROMETHEUS_URL` | `http://127.0.0.1:9090` | Prometheus base URL (health). |
| `HEALTH_PROBE_ENABLED` | `true` | Enable periodic integration health probes. |
| `HEALTH_PROBE_INTERVAL_MS` | `30000` | Interval (ms) between probe runs. |
| `HEALTH_PROBE_TIMEOUT_MS` | `3000` | Per-probe timeout (ms). |

#### Bundled Grafana

| Variable | Default | Purpose |
| --- | --- | --- |
| `GRAFANA_ADMIN_USER` | `admin` | Grafana admin user (mapped to `GF_SECURITY_ADMIN_USER`). |
| `GRAFANA_ADMIN_PASSWORD` | `admin` | Grafana admin password (mapped to `GF_SECURITY_ADMIN_PASSWORD`). |
| `GF_AUTH_ANONYMOUS_ENABLED` | `false` | Anonymous access (kept off → login required). |
| `GF_USERS_ALLOW_SIGN_UP` | `false` | Self sign-up (kept off). |
| `GF_*` | — | Any standard Grafana setting via env (e.g. `GF_SERVER_ROOT_URL`, `GF_SMTP_ENABLED`, `GF_LOG_LEVEL`). See [Grafana config](https://grafana.com/docs/grafana/latest/setup-grafana/configure-grafana/). |

#### Bundled stack (otel-lgtm) — advanced/optional

Honored by the `grafana/otel-lgtm` base. See the [otel-lgtm docs](https://github.com/grafana/docker-otel-lgtm).

| Variable | Default | Purpose |
| --- | --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | Fan-out: forward a **copy** of all ingested telemetry to an external OTLP/HTTP backend (in addition to local LGTM). |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` / `_METRICS_ENDPOINT` / `_LOGS_ENDPOINT` | unset | Per-signal external fan-out endpoints. |
| `OTEL_EXPORTER_OTLP_HEADERS` | unset | Headers (e.g. auth) for the external fan-out, `key=value,key2=value2`. |
| `ENABLE_LOGS_OTELCOL` / `ENABLE_LOGS_GRAFANA` / `ENABLE_LOGS_LOKI` / `ENABLE_LOGS_TEMPO` / `ENABLE_LOGS_PROMETHEUS` | `false` | Verbose per-component logs for debugging. |
| `OTELCOL_EXTRA_ARGS` / `TEMPO_EXTRA_ARGS` | unset | Extra CLI args passed to the collector / Tempo. |

> **Compose-only variables** (used by `infra/docker-compose*.yml`, **not** by the image itself): `OPHIR_IMAGE`, `COMPOSE_PROJECT_NAME`, `OPHIR_PORT`, `GRAFANA_PORT` (host port mappings), plus — for the multi-service stack only — `OPHIR_BIND`, `GRAFANA_BIND`, `DEBUG_BIND`, `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`, and the `*_IMAGE` pins. See `infra/.env.allinone.example` and `infra/.env.example`.

### Delivery security model

- The image contains only compiled `dist/`, production `node_modules`, and the entrypoint — **never** `.env`, source secrets, tests, or specs (enforced by `.dockerignore`).
- Internal services (PostgreSQL, Collector, Loki, Tempo, Prometheus) bind to `127.0.0.1` by default — not exposed to the network. External apps send telemetry **through Ophir** (`:8080/otel`), not directly to the Collector.
- Grafana requires login (anonymous access disabled). Telemetry is admin-only.
- Use a real secrets manager / `--env-file` in production; never commit `infra/.env`.
- The **all-in-one** image is a convenience bundle (built on `grafana/otel-lgtm`): its processes run as root inside the container and share one failure domain, so it's ideal for single-node/demo/edge delivery. For independent scaling and least-privilege, prefer the multi-service stack.

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

## Tutorial to get a credential and Registry an App

# login
$tok = (Invoke-RestMethod -Method Post -Uri http://localhost:8080/v1/auth/login -ContentType application/json -Body '{"email":"admin@example.com","password":"local-development-password"}').accessToken
$h = @{ Authorization = "Bearer $tok" }

# Create The Source
$src = Invoke-RestMethod -Method Post -Uri http://localhost:8080/v1/sources -Headers $h -ContentType application/json -Body '{"slug":"my-app","displayName":"My App","environment":"local"}'

# Create The Credential (The key shows just once)
Invoke-RestMethod -Method Post -Uri "http://localhost:8080/v1/sources/$($src.id)/credentials" -Headers $h

## License

UNLICENSED — internal template project.
