# Contract: OTLP Routing Through Ophir

**Created**: 2026-06-15
**Feature**: [spec.md](../spec.md)

## Purpose

This contract explains how telemetry moves through Ophir without requiring Ophir to become a telemetry database.

## Accepted Endpoints

External applications send OTLP-compatible telemetry to:

- `POST /otel/v1/logs`
- `POST /otel/v1/traces`
- `POST /otel/v1/metrics`

Accepted content types:

- `application/x-protobuf`
- `application/json`

Required header:

- `x-ophir-source-key`: source application credential.

Recommended headers:

- `traceparent`: W3C trace context, when available.
- `x-request-id`: caller request id, when available.

## Source Authentication

For every telemetry request, Ophir must:

1. Read `x-ophir-source-key`.
2. Hash/compare the key against active source credentials.
3. Reject missing, disabled, expired, or unknown credentials.
4. Record an audit event for accepted and rejected attempts.
5. Forward only accepted requests to the Collector.

## Forwarding Rules

Ophir forwards accepted telemetry to the OpenTelemetry Collector:

- Logs: Collector `/v1/logs`
- Traces: Collector `/v1/traces`
- Metrics: Collector `/v1/metrics`

Forwarded metadata:

- `x-ophir-source-id`
- `x-ophir-source-slug`
- `x-ophir-environment`
- `x-ophir-request-id`

The Collector configuration may map these headers into resource attributes where supported. If a backend path cannot preserve headers directly, Ophir must still keep routing/audit metadata in PostgreSQL.

## Expected Backend Routing

```text
Ophir /otel/v1/logs    -> Collector logs pipeline    -> Loki
Ophir /otel/v1/traces  -> Collector traces pipeline  -> Tempo
Ophir /otel/v1/metrics -> Collector metrics pipeline -> Prometheus scrape/export path
```

## Response Semantics

`202 Accepted` means:

- Source authentication passed.
- Ophir accepted the request for forwarding.
- The request was handed to the next configured telemetry step.

`202 Accepted` does not mean the telemetry is already visible in Grafana.

`401 Unauthorized` means:

- Source credential is missing, invalid, disabled, expired, or rotated.

`502 Bad Gateway` means:

- Source authentication passed, but Ophir could not forward to the Collector.

## Redaction And Sensitive Data

Primary redaction belongs in the Collector pipeline because the Collector can process telemetry before export. Ophir owns the policy metadata and should expose health/status around whether redaction config is active.

Known sensitive keys should include at least:

- `authorization`
- `cookie`
- `set-cookie`
- `password`
- `secret`
- `token`
- `api_key`
- `credit_card`

## Cardinality Rule For Metrics

Metric attributes must stay low-cardinality.

Allowed examples:

- `service.name`
- `deployment.environment`
- `http.method`
- `http.route`
- `http.status_code`

Avoid:

- user email
- user id
- session id
- full URL with unique IDs
- request body
- raw IP where not needed
- exact latitude/longitude
