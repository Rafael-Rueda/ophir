# Ophir Observability Architecture Memory

**Created**: 2026-06-15
**Status**: Planned technical architecture
**Related Spec**: ../../specs/001-ophir-observability-hub/spec.md
**Related Plan**: ../../specs/001-ophir-observability-hub/plan.md

## Short Answer

Yes, the diagram makes the intent understandable. It communicates that Ophir should be an external, application-agnostic observability layer: applications send telemetry into a custom Ophir API, Ophir authenticates access, organizes and forwards logs/traces/metrics, and exposes telemetry access only to admins through external dashboards.

The diagram is strongest at showing the product boundary: Ophir is not embedded inside one application. It is a central service around telemetry registration, access control, and visualization.

## What I Understand Ophir To Be

- Ophir is a custom observability API and admin interface.
- Ophir receives telemetry from one or more external applications.
- Ophir separates telemetry into logs, traces, and metrics while keeping enough shared metadata to correlate them.
- Ophir has an auth boundary where only admins can view telemetry.
- Ophir has a logs registry that likely records source applications, telemetry streams, or ingestion metadata.
- Ophir uses external dashboards as the primary telemetry visualization surface.
- Ophir may integrate with Grafana and backend systems such as Prometheus.
- Ophir should be external and application-agnostic, so client applications should not need Ophir-specific business assumptions.

## Interpreted Flow

1. A client application emits telemetry to Ophir.
2. Ophir authenticates the source and/or the user.
3. Ophir accepts log, trace, and metric data.
4. Ophir normalizes telemetry and records routing metadata with source, environment, timestamp, severity/status, and correlation identifiers.
5. Ophir forwards telemetry to specialized observability backends.
6. Admin users access protected dashboard entry points and integration health through Ophir.
7. Grafana is the primary visualization surface for the telemetry stored in downstream backends.

## Important Correction From The Diagram

The path `Logs -> Pino -> Prometheus` should be treated carefully.

- Pino is a structured JSON logger for application logs and is already the logger Fastify uses when logging is enabled.
- Prometheus is a metrics system. It should not be treated as the primary destination for raw logs.
- If logs need to be queried in Grafana, likely candidates are Loki, OTLP logs through an OpenTelemetry Collector, or an application database/search store.
- If metrics need to be scraped, Prometheus is a good candidate.
- If traces need to be queried in Grafana, Tempo is a natural Grafana-native candidate; Jaeger is also useful for development and tracing exploration.

## Candidate Technical Direction

The user changed the runtime preference from Deno to Node.js to improve Fastify compatibility. TypeScript and Fastify remain part of the preferred stack.

Recommended first architecture hypothesis:

- Runtime: Node.js 24 LTS with TypeScript.
- HTTP API: Fastify v5 on native Node.js APIs.
- Logs: Fastify logger/Pino for Ophir internal logs; structured log ingestion format for external app logs.
- Traces: OpenTelemetry as the standard API and data model.
- Metrics: OpenTelemetry metrics first, with Prometheus export/scrape as an integration choice.
- Router/exporter: OpenTelemetry Collector as the neutral path from Ophir to Prometheus, Tempo, Loki, Grafana Cloud, Honeycomb, Datadog, or other backends.
- Dashboard: Grafana as the primary visualization surface; Ophir should focus on protected access, source registry, integration health, routing metadata, and audit trails.

## Clarified Decisions

- Q1: Ophir should act mainly as a forwarding layer to specialized telemetry backends, after validating and normalizing incoming telemetry. It should keep registry, routing metadata, health, and audit state, but not be the long-term raw telemetry source of truth.
- Q2: v1 should include logs, traces, and metrics together.
- Q3: Grafana should be the primary telemetry visualization surface.
- Runtime revision: use Node.js instead of Deno so Fastify, Pino, PostgreSQL clients, and OpenTelemetry Node instrumentation run on their native compatibility path.

## Library And Backend Candidates

### Node.js And Fastify

- Node.js 24 LTS is the preferred runtime for v1.
- Fastify v5 requires Node.js 20+, so Node.js 24 LTS is comfortably inside the supported range.
- This removes the earlier Deno compatibility spike for Fastify and lets the project use normal npm package behavior.

### Logs

- `pino`: default-aligned with Fastify logging; good for JSON logs and internal service logs.
- `pino-pretty`: development-only pretty printing.
- Loki or OTLP logs: better candidates than Prometheus for centralized log querying.

### Traces

- `@opentelemetry/api`: API for custom spans.
- `@opentelemetry/sdk-node`: Node.js SDK bootstrap.
- `@opentelemetry/auto-instrumentations-node`: broad Node auto-instrumentation.
- `@opentelemetry/instrumentation-fastify`: Fastify-specific tracing instrumentation.
- Trace backend candidates: Grafana Tempo, Jaeger, Honeycomb, Datadog.

### Metrics

- `@opentelemetry/api` and `@opentelemetry/sdk-node`: custom and runtime metrics setup for Node.js.
- OpenTelemetry Collector: recommended bridge into Prometheus-compatible storage.
- `prom-client`: mature Node Prometheus client; consider only if Ophir must expose a direct `/metrics` scrape endpoint in addition to OTLP/Collector flow.
- Metrics backend candidates: Prometheus, Grafana Mimir, Grafana Cloud Metrics.

## Remaining Architecture Questions

1. Is Ophir only an ingestion gateway, or also a registry/config layer that tells applications where to send telemetry?
2. Are telemetry viewers only admins forever, or will there later be project/team/service-scoped users?
3. What is the expected first deployment shape: local Docker compose, single VPS, Kubernetes, or managed Node container platform?
4. Does every client app integrate with an Ophir SDK, or should Ophir accept generic OTLP/HTTP payloads?

## Sources Checked

- Node.js releases: https://nodejs.org/en/about/previous-releases
- Node.js release schedule: https://github.com/nodejs/Release
- Fastify v5 migration and Node support: https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/
- Fastify logging with Pino: https://fastify.dev/docs/latest/Reference/Logging/
- OpenTelemetry JavaScript Node setup: https://opentelemetry.io/docs/languages/js/getting-started/nodejs/
- Prometheus client libraries: https://prometheus.io/docs/instrumenting/clientlibs/
- `prom-client` README: https://github.com/siimon/prom-client
