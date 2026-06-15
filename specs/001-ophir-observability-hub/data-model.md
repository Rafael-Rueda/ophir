# Data Model: Ophir Observability Hub

**Created**: 2026-06-15
**Feature**: [spec.md](./spec.md)

## Storage Boundary

Ophir stores control-plane data only. It does not store long-term raw telemetry.

Stored in PostgreSQL:

- Admin users and sessions.
- Source applications and credentials.
- Integration definitions and health snapshots.
- Dashboard links.
- Routing/redaction policy metadata.
- Audit events.

Stored outside Ophir:

- Logs in Loki.
- Traces in Tempo.
- Metrics in Prometheus.

## Entity: AdminUser

Represents a human admin who can manage sources and view protected telemetry access points.

Fields:

- `id`: stable unique identifier.
- `email`: unique login email.
- `display_name`: human-readable name.
- `password_hash`: hashed credential if local auth is enabled.
- `role`: `admin`.
- `status`: `active`, `disabled`.
- `created_at`: creation timestamp.
- `updated_at`: last update timestamp.
- `last_login_at`: nullable timestamp.

Validation rules:

- `email` must be unique and normalized.
- `role` must be admin-only in v1.
- Disabled users cannot create sessions.

Relationships:

- Has many `AdminSession`.
- Produces many `AuditEvent`.

## Entity: AdminSession

Represents an authenticated admin session.

Fields:

- `id`: stable unique identifier.
- `admin_user_id`: linked admin.
- `token_family_id`: groups rotated tokens.
- `expires_at`: expiration timestamp.
- `revoked_at`: nullable timestamp.
- `created_at`: creation timestamp.

Validation rules:

- Expired or revoked sessions are rejected.
- Sessions must belong to active admins.

## Entity: SourceApplication

Represents an external app allowed to send telemetry.

Fields:

- `id`: stable unique identifier.
- `slug`: stable machine name, such as `checkout-api`.
- `display_name`: human-readable name.
- `environment`: `local`, `development`, `staging`, `production`, or configured value.
- `owner_name`: nullable owner label.
- `owner_contact`: nullable contact email or channel.
- `status`: `active`, `disabled`.
- `created_at`: creation timestamp.
- `updated_at`: last update timestamp.

Validation rules:

- `slug` must be unique per environment.
- Disabled sources cannot ingest telemetry.
- `slug` must be safe for labels and URLs.

Relationships:

- Has many `SourceCredential`.
- Has many `TelemetryRoute`.
- Has many `DashboardLink`.
- Appears in many `AuditEvent`.

## Entity: SourceCredential

Represents an API key used by a source application to send telemetry.

Fields:

- `id`: stable unique identifier.
- `source_application_id`: linked source.
- `key_prefix`: short visible prefix for admin identification.
- `key_hash`: hashed secret key.
- `status`: `active`, `disabled`, `rotated`.
- `created_at`: creation timestamp.
- `expires_at`: nullable expiration timestamp.
- `last_used_at`: nullable timestamp.
- `rotated_at`: nullable timestamp.

Validation rules:

- Plaintext keys are only shown once at creation time.
- Stored keys must be hashed.
- Disabled, expired, or rotated keys cannot ingest telemetry.

## Entity: TelemetryIntegration

Represents a configured destination or support service.

Fields:

- `id`: stable unique identifier.
- `kind`: `collector`, `loki`, `tempo`, `prometheus`, `grafana`.
- `name`: human-readable name.
- `base_url`: service URL.
- `status`: `healthy`, `degraded`, `unavailable`, `unknown`.
- `last_checked_at`: nullable timestamp.
- `last_success_at`: nullable timestamp.
- `last_error`: nullable short error summary.
- `created_at`: creation timestamp.
- `updated_at`: last update timestamp.

Validation rules:

- `kind` must be one of the supported integration kinds.
- Health status is updated by probes, not manually edited during normal operation.

Relationships:

- Has many `IntegrationHealthCheck`.
- May have many `DashboardLink`.

## Entity: IntegrationHealthCheck

Represents one health probe result for an integration.

Fields:

- `id`: stable unique identifier.
- `integration_id`: linked integration.
- `status`: `healthy`, `degraded`, `unavailable`.
- `latency_ms`: nullable measured latency.
- `error_code`: nullable machine-readable error.
- `error_message`: nullable human-readable error.
- `checked_at`: timestamp.

Validation rules:

- Health checks are append-only.
- Error detail must not contain secrets.

## Entity: TelemetryRoute

Represents how one source and telemetry type should be forwarded.

Fields:

- `id`: stable unique identifier.
- `source_application_id`: linked source.
- `telemetry_type`: `logs`, `traces`, `metrics`.
- `collector_endpoint_path`: `/v1/logs`, `/v1/traces`, or `/v1/metrics`.
- `enabled`: boolean.
- `created_at`: creation timestamp.
- `updated_at`: last update timestamp.

Validation rules:

- Each active source must have enabled routes for logs, traces, and metrics in v1.
- Disabled routes reject or drop according to explicit policy; default is reject.

## Entity: DashboardLink

Represents a protected link from Ophir to Grafana dashboard or Explore view.

Fields:

- `id`: stable unique identifier.
- `source_application_id`: nullable linked source.
- `integration_id`: linked Grafana integration.
- `title`: human-readable label.
- `url_template`: dashboard URL with placeholders for source, environment, and time range.
- `telemetry_type`: `logs`, `traces`, `metrics`, `overview`.
- `status`: `active`, `disabled`.
- `created_at`: creation timestamp.
- `updated_at`: last update timestamp.

Validation rules:

- URL templates must point to approved Grafana base URLs.
- Disabled links are hidden from admin API responses.

## Entity: RedactionRule

Represents a policy that blocks or masks sensitive telemetry attributes.

Fields:

- `id`: stable unique identifier.
- `name`: human-readable label.
- `match_path`: attribute path or key pattern.
- `action`: `drop`, `mask`, `hash`.
- `enabled`: boolean.
- `created_at`: creation timestamp.
- `updated_at`: last update timestamp.

Validation rules:

- Rules must not be empty.
- Redaction config must be exportable to Collector configuration or equivalent runtime policy.

## Entity: AuditEvent

Represents a security or operational event.

Fields:

- `id`: stable unique identifier.
- `event_type`: machine-readable event type.
- `actor_type`: `admin`, `source`, `system`, `anonymous`.
- `actor_id`: nullable linked actor id.
- `source_application_id`: nullable linked source.
- `result`: `allowed`, `denied`, `failed`.
- `reason`: nullable short reason.
- `request_id`: nullable request id.
- `correlation_id`: nullable trace id or request correlation id.
- `metadata`: small structured metadata object.
- `created_at`: event timestamp.

Validation rules:

- Audit events are append-only.
- Metadata must not contain raw telemetry payloads or secrets.
- Denied ingestion and denied admin access must always create audit events.

## State Transitions

### SourceApplication

```text
active -> disabled
disabled -> active
```

Disabled sources reject all telemetry ingestion.

### SourceCredential

```text
active -> rotated
active -> disabled
active -> expired
rotated -> disabled
```

Only active, non-expired credentials are accepted.

### TelemetryIntegration

```text
unknown -> healthy
unknown -> degraded
unknown -> unavailable
healthy -> degraded
healthy -> unavailable
degraded -> healthy
degraded -> unavailable
unavailable -> degraded
unavailable -> healthy
```

Integration health does not stop ingestion by itself. It changes admin visibility and fallback behavior.

## Data That Must Not Be Stored In Ophir

- Full raw log bodies for long-term retention.
- Full trace payloads for long-term retention.
- Full metric series for long-term retention.
- Plaintext source API keys.
- Password plaintext.
- Sensitive telemetry fields such as authorization headers, cookies, secrets, or personal identifiers.
