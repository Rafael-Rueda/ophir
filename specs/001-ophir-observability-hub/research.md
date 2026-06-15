# Research: Ophir Observability Hub

**Created**: 2026-06-15
**Updated**: 2026-06-15
**Feature**: [spec.md](./spec.md)

## Decision: Use Node.js 24 LTS with TypeScript

**Rationale**: The project is changing from Deno to Node.js to reduce Fastify compatibility risk. Fastify is a Node-first framework built around Node core HTTP APIs and the wider npm plugin ecosystem. Node.js 24 is the current LTS line as of this planning update, while Fastify v5 requires Node.js 20 or newer.

Node.js also gives Ophir a cleaner OpenTelemetry path because the official JavaScript Node SDK, Node auto-instrumentation bundle, and Fastify instrumentation are intended for this runtime.

**Alternatives considered**:

- Deno 2: attractive runtime, but it adds compatibility questions around Fastify plugins, raw body handling, PostgreSQL clients, and Node OpenTelemetry instrumentation.
- Node.js 22 LTS: still valid, but Node.js 24 LTS gives a longer support window.
- Bun: convenient and fast, but not as conservative for Fastify/OpenTelemetry production compatibility.

**Sources**:

- https://nodejs.org/en/about/previous-releases
- https://github.com/nodejs/Release
- https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/

## Decision: Use Fastify v5 for the API layer

**Rationale**: Fastify is the requested HTTP framework and fits the gateway/control-plane shape of Ophir. It provides routing, hooks, schema-based validation/serialization, request lifecycle control, and Pino-aligned logging. Using Node.js removes the earlier runtime mismatch.

**Alternatives considered**:

- Express: broad ecosystem, but less aligned with the user's request and less schema-first.
- Hono: elegant and lightweight, but not the requested framework.
- Native Node HTTP server: lower dependency count, but more custom framework work.

**Source**: https://fastify.dev/docs/latest/Reference/Server/

## Decision: Use OpenTelemetry as the telemetry standard

**Rationale**: Ophir needs logs, traces, and metrics together. OpenTelemetry provides a shared model and APIs for all three. On Node.js, the project can use `@opentelemetry/sdk-node`, `@opentelemetry/api`, `@opentelemetry/auto-instrumentations-node`, and `@opentelemetry/instrumentation-fastify`.

**Alternatives considered**:

- Custom JSON-only telemetry: simpler initially, but creates custom adapters and makes backend routing harder.
- Prometheus-only ingestion: good for metrics, wrong shape for logs and traces.

**Source**: https://opentelemetry.io/docs/languages/js/getting-started/nodejs/

## Decision: Use OpenTelemetry Collector behind Ophir

**Rationale**: The Collector is the right place for batching, retry, routing, filtering, redaction, and exporting to different backends. Ophir should remain a control-plane/gateway service instead of becoming a collector implementation.

**Alternatives considered**:

- Ophir writes directly to Loki, Tempo, and Prometheus: more code paths, more failure modes, harder retries.
- Client applications send directly to the Collector: simpler data path, but bypasses Ophir's source registry, auth, audit, and policy.

**Source**: https://opentelemetry.io/docs/collector/

## Decision: Use Loki for logs

**Rationale**: Logs are event records and need log-specific query/storage behavior. Loki is part of the Grafana ecosystem and is designed for log aggregation.

**Alternatives considered**:

- Prometheus for logs: rejected because Prometheus is for metrics, not raw log storage.
- PostgreSQL for logs: usable for tiny prototypes, but not appropriate for observability log volume.
- Elasticsearch/OpenSearch: powerful, but heavier than needed for the first Grafana-centered deployment.

**Source**: https://grafana.com/docs/loki/latest/

## Decision: Use Tempo for traces

**Rationale**: Tempo is Grafana's tracing backend and integrates with Grafana, Loki, Prometheus, and OpenTelemetry. It is a natural first tracing backend for this architecture.

**Alternatives considered**:

- Jaeger: very useful for tracing exploration; can remain a dev alternative.
- PostgreSQL/custom trace store: rejected because tracing storage/query semantics are specialized.

**Source**: https://grafana.com/docs/tempo/latest/

## Decision: Use Prometheus for v1 metrics

**Rationale**: Prometheus is the standard local/open-source choice for metrics and time series. In v1, Prometheus can scrape the Collector's metrics exporter and Grafana can query Prometheus.

**Alternatives considered**:

- Mimir: better for scalable, long-term, multi-tenant Prometheus-compatible metrics, but more operational complexity than needed for local v1.
- Direct `prom-client` endpoint only: useful for Ophir's own process metrics, but not enough for multi-source OpenTelemetry metrics routing.

**Sources**:

- https://prometheus.io/docs/instrumenting/clientlibs/
- https://grafana.com/docs/mimir/latest/

## Decision: Use Grafana as primary visualization

**Rationale**: Grafana reads data sources such as Prometheus, Loki, and Tempo and visualizes metrics, logs, and traces. This matches the user's answer that dashboarding should be external and primary.

**Alternatives considered**:

- Custom Ophir charts: useful later for curated admin workflows, but too much UI/query work for v1.
- Embedded Grafana only: possible, but first we can expose dashboard links and keep access boundaries explicit.

**Source**: https://grafana.com/docs/grafana/latest/datasources/

## Decision: Use PostgreSQL for Ophir metadata

**Rationale**: Ophir still needs durable application state: admins, source registry, credentials, integration configs, dashboard links, and audit events. PostgreSQL is a good default relational store for that control-plane data.

**Alternatives considered**:

- SQLite: fine for local-only prototypes, weaker for concurrent server deployment.
- MongoDB/document store: flexible, but relationships and audit queries are straightforward in relational form.
- Store everything in observability backends: wrong responsibility boundary; those backends store telemetry, not Ophir admin/control-plane state.

## Decision: Start with `pg` and a small repository layer, not a full ORM

**Rationale**: The first model is small and security-sensitive. Direct SQL migrations plus a small repository layer keeps behavior explicit and avoids ORM migration complexity. Node.js keeps the option open to add Prisma, Drizzle, or Kysely later if schema complexity grows.

**Alternatives considered**:

- Prisma: strong ecosystem, but more generated-client and migration machinery than needed at the first cut.
- Drizzle/Kysely: attractive TypeScript options, but not necessary until schema volume justifies it.

## Decision: Use Node OpenTelemetry auto-instrumentation plus explicit spans

**Rationale**: Node.js makes the official OpenTelemetry Node setup the path of least resistance. The instrumentation module should load before the application code. Use auto-instrumentation for common HTTP/Fastify behavior and explicit spans around Ophir-specific operations like source-key lookup, audit writes, and Collector forwarding.

**Alternatives considered**:

- Manual spans only: reliable but misses useful library-level context.
- Auto-instrumentation only: useful baseline, but explicit business spans make the telemetry much easier to understand.

## Decision: Use source API keys for ingestion and JWT sessions for admins

**Rationale**: External applications need non-human credentials, while admins need human login/session behavior. Splitting these avoids mixing source ingestion permissions with dashboard/admin permissions.

**Alternatives considered**:

- One shared admin token for everything: insecure and hard to audit.
- OAuth/SSO immediately: likely desirable later, but not needed for the first local plan.

## Open Spikes Before Implementation

1. Validate Fastify v5 content-type parsing for `application/x-protobuf` OTLP payload forwarding.
2. Validate OpenTelemetry preload order with `tsx --import ./src/observability/instrumentation.ts src/main.ts`.
3. Validate `@opentelemetry/instrumentation-fastify` captures useful route spans and does not conflict with custom hooks.
4. Validate Collector pipeline from Ophir proxy to Loki, Tempo, and Prometheus.
5. Validate Grafana provisioning for Prometheus, Loki, and Tempo data sources.
