# Ophir Architecture Explained For Beginners

**Created**: 2026-06-15
**Feature**: [spec.md](./spec.md)

## The Big Idea

Ophir is not "a better Prometheus" and not "a replacement for Grafana".

Ophir is the secure gateway and control panel in front of observability tools.

It answers questions like:

- Which applications are allowed to send telemetry?
- Which key belongs to which application?
- Was this telemetry accepted or rejected?
- Are the observability backends healthy?
- Where should an admin go in Grafana to inspect this source?
- Did we block non-admin access?

The specialized observability tools answer different questions:

- Loki: "What logs happened?"
- Tempo: "What path did this request follow?"
- Prometheus: "What numbers changed over time?"
- Grafana: "How do I see all of that?"

## Why Prometheus Is Not Enough By Itself

Prometheus stores metrics. Metrics are numbers over time.

Examples:

- `http_requests_total`
- `ophir_ingestion_rejected_total`
- `http_request_duration_seconds`
- `active_sources`

Logs and traces are different.

A log is an event:

```text
source demo-api rejected because credential expired
```

A trace is a tree/timeline of work:

```text
POST /otel/v1/traces
  -> authenticate source key
  -> record audit event
  -> forward to collector
  -> collector sends to tempo
```

Trying to store logs and traces directly in Prometheus would bend the tool into the wrong shape. That is why the plan uses:

- Prometheus for metrics.
- Loki for logs.
- Tempo for traces.

## The End-To-End Flow

```text
1. App creates telemetry
   |
   v
2. App sends telemetry to Ophir
   |
   v
3. Ophir checks source key
   |
   v
4. Ophir records audit/routing metadata
   |
   v
5. Ophir forwards telemetry to OpenTelemetry Collector
   |
   v
6. Collector routes telemetry:
      logs    -> Loki
      traces  -> Tempo
      metrics -> Prometheus
   |
   v
7. Grafana reads Loki, Tempo, and Prometheus
   |
   v
8. Admin uses Grafana links protected/discovered through Ophir
```

## What Each Piece Does

### External Application

This is any app that wants to be observed. It might be a store API, a worker, a frontend backend, or any service.

It sends telemetry with a source key:

```text
x-ophir-source-key: ophir_src_...
```

That key tells Ophir, "I am allowed to send telemetry as this source."

### Ophir API

Ophir is the custom backend you are planning.

It does these jobs:

- Receives telemetry HTTP requests.
- Checks the source key.
- Rejects unknown/disabled sources.
- Records audit events.
- Forwards valid telemetry to the Collector.
- Lets admins manage sources and credentials.
- Shows health of Collector/Loki/Tempo/Prometheus/Grafana.
- Gives admins links to Grafana dashboards.

Ophir should not do these jobs in v1:

- Store every log forever.
- Store every trace forever.
- Store all metric series.
- Build a full custom charting UI.

That restraint is good architecture. Small, sharp service. Less chaos in the toolbox.

### OpenTelemetry Collector

The Collector is the traffic director for telemetry.

It receives telemetry from Ophir and decides where each type should go.

It can also:

- Batch telemetry before sending.
- Retry when a backend is temporarily down.
- Redact sensitive fields.
- Add or transform attributes.
- Export to multiple destinations.

### Loki

Loki stores logs. Grafana can query Loki using LogQL.

Use Loki when you want to ask:

- "Show me errors from `demo-api` in the last 15 minutes."
- "Show logs for this trace id."
- "Which source had authentication failures?"

### Tempo

Tempo stores traces. Grafana can query Tempo using TraceQL and trace IDs.

Use Tempo when you want to ask:

- "Why was this request slow?"
- "Which step failed?"
- "Did forwarding to the Collector take too long?"

### Prometheus

Prometheus stores metrics.

Use Prometheus when you want to ask:

- "How many telemetry requests per second are arriving?"
- "What percentage is rejected?"
- "What is p95 forwarding latency?"
- "Is the Collector up?"

### Grafana

Grafana is the visual layer.

It connects to:

- Loki for logs.
- Tempo for traces.
- Prometheus for metrics.

Grafana dashboards are the primary visualization for v1.

## What Ophir Stores In PostgreSQL

Ophir stores metadata, not raw telemetry.

Good data for Ophir PostgreSQL:

- Admin users.
- Source applications.
- Hashed source keys.
- Dashboard links.
- Integration configuration.
- Health check history.
- Audit events.
- Redaction policy metadata.

Bad data for Ophir PostgreSQL:

- Every log line.
- Every span.
- Every metric sample.
- Plaintext API keys.
- Passwords.
- Authorization headers.

## Why Use Node.js With Fastify

Node.js runs the server process.

Fastify handles HTTP routing and request lifecycle.

This is the compatibility-friendly path. Fastify is designed around Node's HTTP APIs, and most Fastify plugins assume normal Node/npm behavior. That matters for Ophir because the API needs reliable raw-body forwarding, logging, auth, PostgreSQL access, and OpenTelemetry instrumentation.

Node.js does not remove the need to validate the architecture, but it removes the runtime mismatch. The remaining useful spikes are:

- Fastify v5 `application/x-protobuf` forwarding.
- OpenTelemetry preload order.
- Fastify auto-instrumentation.
- Pino log shape.
- PostgreSQL client behavior.

If one plugin has trouble, the architecture still survives because the most important external standard is HTTP + OTLP + Collector. But Node makes the odds much better, which is exactly why this change is sensible.

## What A Trace Through Ophir Looks Like

Imagine `demo-api` sends traces:

```text
POST /otel/v1/traces
```

Ophir should create its own internal trace around the forwarding process:

```text
ophir.ingest.traces
  -> source_key.lookup
  -> source.status.check
  -> audit.accepted.write
  -> collector.forward
```

If something fails, you can inspect the trace and see which step was slow or broken.

## What Metrics Ophir Should Emit About Itself

Good starter metrics:

- `ophir_ingestion_requests_total`
- `ophir_ingestion_rejected_total`
- `ophir_collector_forward_failures_total`
- `ophir_collector_forward_duration_seconds`
- `ophir_admin_requests_total`
- `ophir_integration_health_status`

These go to Prometheus so Grafana can show operational dashboards.

## First Implementation Shape

Start with the smallest valuable version:

1. Fastify app starts.
2. Health endpoints work.
3. Admin login works.
4. Source registration works.
5. Source key creation works.
6. `/otel/v1/logs`, `/otel/v1/traces`, `/otel/v1/metrics` authenticate and forward.
7. Docker Compose brings up Collector + Loki + Tempo + Prometheus + Grafana.
8. Grafana data sources are provisioned.
9. A demo source sends all three telemetry types.
10. Tests prove valid telemetry is accepted and invalid telemetry is rejected.

After that, the architecture can grow without changing its bones.
