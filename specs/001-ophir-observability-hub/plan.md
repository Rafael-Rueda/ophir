# Implementation Plan: Ophir Observability Hub

**Branch**: `001-ophir-observability-hub` | **Date**: 2026-06-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-ophir-observability-hub/spec.md`

## Summary

Ophir will be a Node.js + TypeScript web service that protects and organizes observability ingestion for external applications. Applications will send logs, traces, and metrics to Ophir using OTLP-compatible HTTP endpoints. Ophir will authenticate the source application, record routing/audit metadata, and forward telemetry to an OpenTelemetry Collector. The Collector will route each signal to the proper specialized backend: Loki for logs, Tempo for traces, and Prometheus for metrics in the first local deployment. Grafana is the primary visualization surface.

Ophir itself is not the long-term telemetry database. Its database stores source registry data, admin users, credentials, integration health, dashboard links, redaction/routing rules, and audit events.

## Beginner Mental Model

Think of the system as a mailroom.

- The external application creates "letters" about what happened: logs, traces, and metrics.
- Ophir is the secure front desk. It checks who sent the letter, records that it passed through, and sends it to the correct department.
- OpenTelemetry Collector is the sorting machine. It knows how to batch, retry, transform, redact, and export telemetry.
- Loki stores log letters.
- Tempo stores trace letters.
- Prometheus stores metric letters.
- Grafana is the reading room where admins inspect the stored information.

High-level flow:

```text
External apps
  |
  | OTLP/HTTP with source API key
  v
Ophir API (Node.js + Fastify)
  |  - authenticate source
  |  - validate route and content type
  |  - record audit/routing metadata
  |  - forward telemetry
  v
OpenTelemetry Collector
  |---- logs ----> Loki
  |---- traces --> Tempo
  |---- metrics -> Prometheus
                    ^
                    |
Grafana reads all three data sources and shows dashboards to admins
```

## Technical Context

**Language/Version**: TypeScript on Node.js 24 LTS.

**Primary Dependencies**:

- `fastify` v5: HTTP server and routing. Fastify v5 requires Node.js 20+, and Node.js 24 LTS keeps the project on an active LTS line.
- `pino`: structured JSON logging through Fastify logger.
- `zod`: request, environment, and domain validation.
- `jose`: JWT/session token signing and verification for admin auth.
- `@opentelemetry/api`: custom spans and metrics inside Ophir code.
- `@opentelemetry/sdk-node`: Node.js OpenTelemetry SDK bootstrap.
- `@opentelemetry/auto-instrumentations-node`: standard Node.js auto-instrumentation bundle.
- `@opentelemetry/instrumentation-fastify`: Fastify-specific tracing instrumentation.
- `tsx`: run TypeScript directly in local development and scripts.
- `vitest`: TypeScript-friendly unit, contract, and integration test runner.
- `pg`: PostgreSQL client for Ophir metadata.
- OpenTelemetry Collector: telemetry routing, batching, retry, redaction/transform pipeline.
- Grafana, Loki, Tempo, Prometheus: local LGTM-style observability stack.

**Storage**:

- PostgreSQL for Ophir control-plane data only.
- Loki for logs.
- Tempo for traces.
- Prometheus for local metrics storage and querying.
- Future option: Mimir for long-term, horizontally scalable Prometheus-compatible metrics.

**Testing**:

- `vitest` for unit, contract, and integration tests.
- `tsc --noEmit` for type checking.
- Fastify `inject()` for HTTP contract tests without opening real sockets.
- Docker Compose based integration tests for PostgreSQL, OpenTelemetry Collector, Prometheus, Loki, Tempo, and Grafana.
- Contract checks against `contracts/openapi.yaml`.

**Target Platform**:

- Local development: Windows host with Node.js 24 LTS and Docker Desktop.
- Runtime target: Linux container or VPS/container host.

**Project Type**: Backend web service / observability gateway.

**Performance Goals**:

- Admin APIs return routine metadata responses in under 300 ms p95 locally.
- Telemetry proxy path adds less than 100 ms p95 overhead before handing data to the Collector under initial v1 load tests.
- At least 95% of accepted telemetry is visible in Grafana data sources within 30 seconds in local integration validation.

**Constraints**:

- Ophir must not store long-term raw telemetry.
- Ophir must deny telemetry viewing to non-admin users.
- Ophir must reject ingestion from unknown or disabled sources.
- Ophir must be application-agnostic: no client business-domain fields are required.
- Sensitive fields must be redacted or blocked before admin visibility, primarily through Collector processors and backed by validation policy in Ophir.
- Metric labels must avoid high cardinality values such as user IDs, emails, full URLs with unique IDs, request bodies, or raw coordinates.

**Scale/Scope**:

- v1 supports logs, traces, and metrics.
- v1 supports one organization/admin domain and multiple registered source applications.
- v1 assumes a local/small deployment first; multi-tenant SaaS, billing, and large retention management are out of scope.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution file still contains the default placeholder template and no enforceable project principles. Gate status: **PASS with note**.

Planning rules applied in place of missing constitution principles:

- Keep Ophir as a thin control-plane service, not a custom observability database.
- Prefer standards before custom formats: OTLP/OpenTelemetry first.
- Keep implementation testable with contract, unit, and integration validation.
- Keep security decisions explicit: source auth, admin auth, audit events, redaction policy.

Post-design re-check: **PASS**. The selected design keeps telemetry storage in specialized backends and keeps Ophir focused on auth, registry, routing metadata, health, and audit behavior.

## Architecture Decisions

### Decision 1: Use OTLP-compatible ingestion instead of inventing a full custom telemetry format

Apps should send telemetry to Ophir through endpoints shaped like OTLP HTTP:

- `/otel/v1/logs`
- `/otel/v1/traces`
- `/otel/v1/metrics`

Reason: OpenTelemetry is already the common language for logs, traces, and metrics. If Ophir invents a completely custom payload, every client app needs custom adapters and every backend conversion becomes harder.

Ophir still remains a custom API because it owns source credentials, admin APIs, audit behavior, integration health, dashboard links, and routing policy.

### Decision 2: Put OpenTelemetry Collector behind Ophir

Ophir should forward accepted telemetry to the Collector rather than directly writing to Loki, Tempo, and Prometheus.

Reason: the Collector is built for receiving, processing, batching, retrying, redacting, and exporting telemetry. That keeps Ophir simpler and avoids three separate backend integrations inside the API server.

### Decision 3: Use Grafana as the primary UI

Ophir does not need to build charts in v1. Instead, it exposes protected dashboard links and integration health, while Grafana reads Loki, Tempo, and Prometheus.

Reason: Grafana already has native data source support for logs, traces, and metrics. Ophir should focus on the missing control-plane layer around source registration, access, health, and audit.

### Decision 4: Use Prometheus only for metrics

Prometheus is not the single backend for all telemetry.

- Logs go to Loki.
- Traces go to Tempo.
- Metrics go to Prometheus.

Reason: Prometheus is a time-series metrics system. It is excellent for counters, gauges, histograms, and alert queries, but it is not the right primary store for raw logs or distributed traces.

### Decision 5: Keep PostgreSQL for Ophir metadata

Ophir needs a normal application database, but not for raw telemetry. PostgreSQL stores the control-plane data that makes Ophir useful: sources, credentials, admins, integration configs, dashboard links, audit events, and health snapshots.

## Beginner Technology Explanation

### Node.js

Node.js is the runtime that runs the server process. In this project it is the safest choice for Fastify because Fastify is built around Node's HTTP server APIs and its plugin ecosystem expects Node semantics.

Node.js does not run TypeScript files by itself in the same way Deno does, so the local plan uses `tsx` during development and scripts. Production can either run compiled JavaScript from `dist/` or use a controlled runtime command if we choose not to compile initially.

### TypeScript

TypeScript is JavaScript with types. The types help us describe what a `SourceApplication`, `TelemetryIntegration`, or `AuditEvent` looks like before the code runs. That catches mistakes earlier.

### Fastify

Fastify is the HTTP framework. It receives requests, routes them to handlers, validates behavior, and returns responses. In Ophir, Fastify handles admin APIs and telemetry proxy endpoints.

### Pino

Pino is the logger used by Fastify. It writes structured JSON logs, which are easier for machines to parse than plain text. Pino is for logging Ophir's own behavior; it is not a replacement for Loki or Prometheus.

### OpenTelemetry

OpenTelemetry is the shared vocabulary for telemetry. It defines common ideas like spans, traces, metrics, logs, resources, and attributes. Using it means Ophir can work with many tools instead of locking itself into one vendor.

### OpenTelemetry Collector

The Collector is a telemetry router and processor. It receives telemetry, optionally transforms/redacts/batches it, then exports it to one or more backends.

### Loki

Loki stores logs. Logs are event records such as "request failed", "source rejected", or "database unavailable".

### Tempo

Tempo stores traces. A trace follows one operation across steps, such as "request entered Ophir", "source credential checked", "telemetry forwarded", "Collector responded".

### Prometheus

Prometheus stores metrics. Metrics are numbers over time, such as request counts, error rates, queue size, and duration histograms.

### Grafana

Grafana reads data sources and draws dashboards. It does not replace the data stores; it queries Loki, Tempo, and Prometheus.

## Project Structure

### Documentation (this feature)

```text
specs/001-ophir-observability-hub/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- architecture-explained.md
|-- contracts/
|   |-- openapi.yaml
|   `-- otel-routing.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md                 # generated later by /speckit-tasks
```

### Source Code (repository root)

```text
package.json
package-lock.json            # generated after dependency install
tsconfig.json
vitest.config.ts

src/
|-- main.ts                  # process entrypoint
|-- app.ts                   # Fastify app factory for runtime and tests
|-- config/
|   |-- env.ts               # typed environment loading
|   `-- runtime.ts           # runtime constants and process settings
|-- http/
|   |-- routes/
|   |   |-- auth.routes.ts
|   |   |-- sources.routes.ts
|   |   |-- integrations.routes.ts
|   |   |-- dashboards.routes.ts
|   |   |-- health.routes.ts
|   |   `-- otel-proxy.routes.ts
|   |-- hooks/
|   |   |-- admin-auth-hook.ts
|   |   |-- source-auth-hook.ts
|   |   `-- request-context-hook.ts
|   `-- schemas/
|       |-- auth.schemas.ts
|       |-- sources.schemas.ts
|       |-- integrations.schemas.ts
|       `-- otel.schemas.ts
|-- auth/
|   |-- admin-auth.service.ts
|   |-- jwt.service.ts
|   `-- password.service.ts
|-- sources/
|   |-- source.service.ts
|   |-- source-credential.service.ts
|   `-- source.repository.ts
|-- telemetry/
|   |-- otel-proxy.service.ts
|   |-- routing-policy.service.ts
|   |-- redaction-policy.service.ts
|   `-- telemetry-types.ts
|-- integrations/
|   |-- integration-health.service.ts
|   |-- dashboard-link.service.ts
|   `-- integration.repository.ts
|-- audit/
|   |-- audit.service.ts
|   `-- audit.repository.ts
|-- db/
|   |-- client.ts
|   |-- migrations/
|   `-- migrate.ts
|-- observability/
|   |-- logger.ts
|   |-- instrumentation.ts   # OpenTelemetry SDK bootstrap loaded before app code
|   |-- tracing.ts
|   `-- metrics.ts
`-- shared/
    |-- errors.ts
    |-- ids.ts
    `-- time.ts

infra/
|-- docker-compose.yml
|-- otel-collector/
|   `-- config.yaml
|-- prometheus/
|   `-- prometheus.yml
|-- grafana/
|   `-- provisioning/
|       |-- datasources/
|       `-- dashboards/
|-- loki/
|   `-- config.yaml
`-- tempo/
    `-- config.yaml

tests/
|-- contract/
|   |-- admin-api.contract.test.ts
|   `-- otel-proxy.contract.test.ts
|-- integration/
|   |-- telemetry-flow.integration.test.ts
|   |-- integration-health.integration.test.ts
|   `-- auth-rbac.integration.test.ts
`-- unit/
    |-- source-auth.test.ts
    |-- routing-policy.test.ts
    |-- redaction-policy.test.ts
    `-- audit.test.ts
```

**Structure Decision**: Use a single backend service with infrastructure files under `infra/`. A custom frontend is intentionally not included in v1 because Grafana is the primary visualization UI. Ophir exposes admin APIs and dashboard links instead of rendering charts itself.

## Operational Flow

### 1. Register a source application

An admin creates a `SourceApplication`, such as `checkout-api` or `rueda-gems-storefront`. Ophir creates a source credential. The external app stores that credential as a secret.

### 2. Configure the source application telemetry endpoint

The app configures its OpenTelemetry exporter to send logs, traces, and metrics to Ophir:

```text
https://ophir.example.com/otel/v1/logs
https://ophir.example.com/otel/v1/traces
https://ophir.example.com/otel/v1/metrics
```

The app includes its source credential in `x-ophir-source-key`.

### 3. Ophir authenticates and audits ingestion

Ophir checks that the source key exists, is active, and is allowed to send telemetry. Ophir records an audit event for accepted and rejected telemetry requests.

### 4. Ophir forwards telemetry to the Collector

Ophir forwards accepted telemetry to the OpenTelemetry Collector. The Collector receives the telemetry, applies batching/retry/redaction/transform rules, and sends it to the right backend.

### 5. Specialized backends store each telemetry signal

- Logs: Loki.
- Traces: Tempo.
- Metrics: Prometheus.

### 6. Grafana visualizes everything

Grafana has data sources for Loki, Tempo, and Prometheus. Admins use Grafana dashboards and Explore to inspect telemetry.

### 7. Ophir monitors the integrations

Ophir periodically checks whether the Collector, Loki, Tempo, Prometheus, and Grafana are reachable. Admin APIs show whether each integration is healthy, degraded, or unavailable.

## Security Plan

- Source apps authenticate with source API keys.
- Admins authenticate with JWT-backed sessions.
- Source keys are stored hashed, not plaintext.
- Disabled sources cannot ingest telemetry.
- Admin-only endpoints require an admin role.
- Ingestion and viewing denials create audit events.
- Sensitive telemetry fields are blocked/redacted in the Collector pipeline and backed by Ophir policy configuration.
- Grafana must not be exposed publicly without its own auth or a trusted network boundary.

## Observability For Ophir Itself

Ophir should observe itself too.

- Logs: Fastify/Pino JSON logs.
- Traces: manual OpenTelemetry spans around important operations such as source auth, DB calls, and telemetry forwarding.
- Metrics: counters and histograms for accepted/rejected telemetry, proxy duration, Collector errors, admin API latency, and integration health.

Important Node/Fastify note: OpenTelemetry setup must run before the Fastify application is imported. In development, start Ophir with an import/preload step for `src/observability/instrumentation.ts`; in production, preload the compiled instrumentation module before `dist/main.js`. This lets the Node SDK and Fastify instrumentation patch libraries early enough to capture useful spans.

## Implementation Phases

### Phase A: Foundation

- Create Node.js project files.
- Add Fastify app factory.
- Add typed env config.
- Add health endpoints.
- Add Pino logger.
- Add PostgreSQL connection and migrations.

### Phase B: Admin and source registry

- Add admin auth.
- Add source CRUD endpoints.
- Add source credential creation, hashing, rotation, disablement.
- Add audit event storage.

### Phase C: Telemetry proxy

- Add `/otel/v1/logs`, `/otel/v1/traces`, `/otel/v1/metrics`.
- Validate source credential.
- Preserve raw body and content type.
- Forward to Collector.
- Record accepted/rejected/failed forwarding metadata.

### Phase D: Local observability stack

- Add Docker Compose for PostgreSQL, Collector, Loki, Tempo, Prometheus, and Grafana.
- Configure Collector pipelines.
- Provision Grafana data sources and starter dashboards.

### Phase E: Integration health and dashboard links

- Add integration health probes.
- Add dashboard link registry.
- Add admin endpoints for health and dashboard discovery.

### Phase F: Validation

- Unit tests for auth, routing, redaction policy, and audit.
- Contract tests for admin API and ingestion endpoints.
- Integration test that sends sample logs/traces/metrics through Ophir and verifies backend visibility.

## Complexity Tracking

No constitution violations are currently known. The design deliberately avoids the largest complexity trap: building a custom telemetry database.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
