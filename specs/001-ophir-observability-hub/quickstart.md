# Quickstart: Validate Ophir Observability Hub

**Created**: 2026-06-15
**Feature**: [spec.md](./spec.md)

This guide describes how the finished feature should be validated. It is intentionally written as a beginner-friendly flow, not as implementation code.

## What You Are Proving

You are proving that Ophir can:

1. Register an external application.
2. Give that application a source key.
3. Receive logs, traces, and metrics from that application.
4. Forward telemetry to the OpenTelemetry Collector.
5. Route logs to Loki, traces to Tempo, and metrics to Prometheus.
6. Let Grafana show all three signals.
7. Deny telemetry from unknown sources.
8. Show integration health to admins.

## Prerequisites

- Node.js 24 LTS installed.
- npm installed with Node.js.
- Docker Desktop installed and running.
- A terminal opened at the repository root.

## Expected Local Services

After implementation, local development should start these services:

```text
Ophir API:              http://localhost:8080
Grafana:                http://localhost:1234
OpenTelemetry Collector http://localhost:4318
Prometheus:             http://localhost:9090
Loki:                   http://localhost:3100
Tempo:                  http://localhost:3200
PostgreSQL:             localhost:5442
```

## Step 1: Start Infrastructure

If dependencies are not installed yet, run:

```powershell
npm install
```

Expected command:

```powershell
docker compose -f infra/docker-compose.yml up -d
```

Expected result:

- PostgreSQL is ready.
- Collector is ready.
- Loki, Tempo, Prometheus, and Grafana are running.
- Grafana has provisioned data sources for Loki, Tempo, and Prometheus.

## Step 2: Run Database Migrations

Expected command:

```powershell
npm run db:migrate
```

Expected result:

- Admin, source, credential, integration, dashboard, and audit tables exist.

## Step 3: Start Ophir

Expected command:

```powershell
npm run dev
```

Expected result:

- Ophir starts on `http://localhost:8080`.
- `GET /health/live` returns `200`.
- `GET /health/ready` returns `200` when required local dependencies are reachable.

## Step 4: Create Or Seed An Admin

Expected command:

```powershell
npm run admin:create
```

Expected result:

- A local admin account exists.
- The password or setup token is shown once or read from local env.

## Step 5: Login As Admin

Expected API:

```http
POST /v1/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "local-development-password"
}
```

Expected result:

- Response includes an admin JWT access token.

## Step 6: Register A Source Application

Expected API:

```http
POST /v1/sources
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "slug": "demo-api",
  "displayName": "Demo API",
  "environment": "local",
  "ownerName": "Local Developer",
  "ownerContact": "dev@example.com"
}
```

Expected result:

- Source application is created.
- Source status is `active`.

## Step 7: Create A Source Key

Expected API:

```http
POST /v1/sources/<source-id>/credentials
Authorization: Bearer <admin-token>
```

Expected result:

- Response includes a plaintext source key once.
- Ophir stores only the key hash.

## Step 8: Send Sample Logs, Traces, And Metrics

Expected behavior:

- A sample app or test helper sends OTLP-compatible logs to `/otel/v1/logs`.
- It sends OTLP-compatible traces to `/otel/v1/traces`.
- It sends OTLP-compatible metrics to `/otel/v1/metrics`.
- Each request includes `x-ophir-source-key`.

Expected result:

- Ophir returns `202 Accepted`.
- Audit events are recorded.
- Collector receives the telemetry.

## Step 9: Verify Grafana

Open Grafana:

```text
http://localhost:1234
```

Expected checks:

- Logs appear in the Loki data source.
- Traces appear in the Tempo data source.
- Metrics appear in the Prometheus data source.
- Dashboards or Explore views can filter by source/environment labels or equivalent metadata.

## Step 10: Verify Rejection Of Unknown Source

Send the same telemetry request with a wrong `x-ophir-source-key`.

Expected result:

- Ophir returns `401 Unauthorized`.
- No telemetry is forwarded.
- A denied ingestion audit event is stored.

## Step 11: Verify Integration Health

Expected API:

```http
GET /v1/integrations
Authorization: Bearer <admin-token>
```

Expected result:

- Collector, Loki, Tempo, Prometheus, and Grafana appear with health status.

## Step 12: Run Tests

Expected commands:

```powershell
npm test
npm run typecheck
```

Expected result:

- Unit tests pass.
- Contract tests pass.
- Integration tests prove the telemetry flow.

## Beginner Troubleshooting

If Grafana shows no data:

1. Check Ophir accepted the request.
2. Check Ophir audit events for rejection or forwarding failure.
3. Check Collector logs.
4. Check whether Loki/Tempo/Prometheus are healthy.
5. Check Grafana data source configuration.

If metrics appear but logs do not:

- Prometheus is working, but Loki or the logs pipeline may be broken.

If logs appear but traces do not:

- Loki is working, but Tempo or the traces pipeline may be broken.

If everything is accepted but nothing appears:

- The Collector pipeline is the first place to inspect.
