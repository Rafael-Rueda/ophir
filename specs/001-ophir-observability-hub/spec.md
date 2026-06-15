# Feature Specification: Ophir Observability Hub

**Feature Branch**: `001-ophir-observability-hub`

**Created**: 2026-06-15

**Status**: Ready for Planning

**Input**: User description: "Ophir should be an external/application-agnostic custom API where external applications can send observability data. The system should include auth, logs registry, logs, tracers, metrics, database-backed telemetry organization, admin-only visibility, charts display, and integrations with observability tools such as Grafana and Prometheus. The user wants the concept clarified before technical planning."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Register Telemetry From External Applications (Priority: P1)

As an application owner, I want my application to send telemetry to Ophir in a consistent way so that its operational behavior can be inspected outside the application itself.

**Why this priority**: Without telemetry ingestion from external applications, Ophir has no core value.

**Independent Test**: Submit sample log, trace, and metric events from a registered source and verify that Ophir accepts them, records their source, and makes them available to configured telemetry backends for later inspection.

**Acceptance Scenarios**:

1. **Given** a registered source application, **When** it submits a valid telemetry item, **Then** Ophir records routing metadata with source identity, timestamp, telemetry type, and correlation metadata, then forwards the item to the configured telemetry backend.
2. **Given** an unregistered or unauthorized source, **When** it submits telemetry, **Then** Ophir rejects the submission and records the failed attempt for audit review.

---

### User Story 2 - Admins Inspect Consolidated Telemetry (Priority: P2)

As an admin, I want protected access to logs, traces, metrics, and dashboards from multiple applications so that I can diagnose problems without opening each application separately.

**Why this priority**: The diagram explicitly protects telemetry visibility behind admin access and shows charts as a primary output.

**Independent Test**: Sign in as an admin, select a source application and time range, and confirm that Ophir gives access to the matching telemetry and primary dashboard views.

**Acceptance Scenarios**:

1. **Given** an authenticated admin, **When** the admin filters telemetry by source and time range, **Then** Ophir provides access to matching logs, traces, metrics, and primary dashboard views.
2. **Given** a non-admin user, **When** the user attempts to view telemetry, **Then** Ophir denies access.

---

### User Story 3 - Monitor Telemetry Backend Health (Priority: P3)

As an admin, I want to know whether Ophir's downstream telemetry integrations are healthy so that missing dashboards or delayed data can be diagnosed quickly.

**Why this priority**: The diagram includes external observability tools, and integration failures should be visible rather than silent.

**Independent Test**: Simulate an unavailable downstream telemetry destination and verify that Ophir still accepts local telemetry according to policy while showing an integration health warning.

**Acceptance Scenarios**:

1. **Given** a downstream telemetry destination is unavailable, **When** Ophir receives new telemetry, **Then** Ophir follows the configured fallback behavior and shows the integration as degraded.
2. **Given** the destination recovers, **When** Ophir checks integration health again, **Then** the admin view shows the destination as healthy.

### Edge Cases

- A telemetry submission is valid but lacks a correlation identifier.
- A source sends a high volume of telemetry in a short period.
- A downstream observability backend is unavailable or slow.
- Telemetry contains sensitive values such as credentials or personal data.
- Two applications submit events with the same local request identifier.
- An admin searches a time range where no telemetry exists.
- A non-admin attempts to access telemetry through direct URLs or API calls.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow external applications to submit telemetry items.
- **FR-002**: System MUST identify the source application for each accepted telemetry item.
- **FR-003**: System MUST classify accepted telemetry as log, trace, metric, or another explicitly supported telemetry type.
- **FR-004**: System MUST preserve enough shared metadata to correlate related logs, traces, and metrics.
- **FR-005**: System MUST restrict telemetry viewing to admin users.
- **FR-006**: System MUST reject telemetry viewing attempts from non-admin users.
- **FR-007**: Admin users MUST be able to filter telemetry by source, telemetry type, time range, severity or status, and correlation identifier when available.
- **FR-008**: System MUST provide admin access to primary dashboard views for accepted telemetry.
- **FR-009**: System MUST expose the health state of configured telemetry integrations.
- **FR-010**: System MUST prevent telemetry integration failures from silently hiding accepted telemetry.
- **FR-011**: System MUST redact or block known sensitive fields before telemetry is visible to admins.
- **FR-012**: System MUST record audit events for denied telemetry ingestion and denied telemetry viewing attempts.
- **FR-013**: System MUST act primarily as a forwarding layer to specialized telemetry backends after validating, normalizing, and recording routing metadata.
- **FR-014**: System MUST include logs, traces, and metrics in the v1 telemetry scope.
- **FR-015**: System MUST use external dashboards as the primary telemetry visualization surface.

### Key Entities

- **Source Application**: An external system that submits telemetry to Ophir; identified by name, environment, owner, status, and credential or trust relationship.
- **Telemetry Item**: A single accepted observability record; includes type, timestamp, source, payload summary, and optional correlation metadata.
- **Log Record**: A textual or structured event describing something that happened in a source application.
- **Trace Record**: A request or operation path made of spans that help explain distributed execution.
- **Metric Record**: A numeric measurement over time, such as count, duration, size, or gauge value.
- **Admin User**: A user allowed to view telemetry and integration health.
- **Telemetry Integration**: A downstream or adjacent observability destination used for storage, querying, visualization, alerting, or export.
- **Dashboard View**: A visual telemetry surface for a selected source, type, time range, or operational question, primarily served by configured external dashboard tooling.
- **Audit Event**: A security-relevant event such as rejected ingestion, denied viewing, or configuration changes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can locate telemetry for a known source application and time range through protected dashboard access in under 2 minutes.
- **SC-002**: At least 95% of accepted telemetry items are available through configured dashboard views within 30 seconds during agreed v1 load tests.
- **SC-003**: 100% of telemetry viewing attempts by non-admin users are denied.
- **SC-004**: An admin can move from a known correlation identifier to related logs, traces, or metrics in 3 steps or fewer.
- **SC-005**: A downstream integration failure is visible to admins within 1 minute of detection.
- **SC-006**: Sensitive fields covered by the redaction policy are not visible in admin telemetry views.

## Assumptions

- Ophir is an internal/admin observability product rather than a public analytics product.
- External applications are able to send structured telemetry or can be adapted to do so.
- Admin-only viewing is required for v1.
- The first version includes logs, traces, and metrics together.
- The first version prioritizes operational diagnosis and forwarding to specialized telemetry backends over long-term raw telemetry storage inside Ophir.
- Ophir should stay application-agnostic and avoid business-domain assumptions from any one client application.
- External dashboards are the primary visualization surface; Ophir owns protected access, source registry, routing metadata, integration health, and audit behavior.
