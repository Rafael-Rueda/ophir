---
description: "Task list for Ophir Observability Hub implementation"
---

# Tasks: Ophir Observability Hub

**Input**: Design documents from `/specs/001-ophir-observability-hub/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml, contracts/otel-routing.md

**Tests**: Included. The spec defines explicit "Independent Test" criteria per user story plus measurable success criteria, so contract, unit, and integration tests are part of scope.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Single backend service. Source in `src/`, tests in `tests/`, infrastructure in `infra/` at repository root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and tooling.

- [X] T001 Create `package.json` with Node 24 LTS engines, Fastify v5 + OpenTelemetry + pg + zod + jose dependencies and npm scripts (dev, build, start, db:migrate, admin:create, test, typecheck, lint).
- [X] T002 [P] Create `tsconfig.json` (NodeNext, strict) and `vitest.config.ts`.
- [X] T003 [P] Configure linting/formatting: `eslint.config.js`, `.prettierrc.json`.
- [X] T004 [P] Create ignore files: `.gitignore`, `.dockerignore`, `.prettierignore`, and `.env.example`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story.

- [X] T005 [P] Implement typed env loading in `src/config/env.ts` (zod) and runtime constants in `src/config/runtime.ts`.
- [X] T006 [P] Implement shared utilities: `src/shared/errors.ts`, `src/shared/ids.ts`, `src/shared/time.ts`.
- [X] T007 [P] Implement Pino logger in `src/observability/logger.ts`.
- [X] T008 [P] Implement OpenTelemetry bootstrap in `src/observability/instrumentation.ts`, plus `src/observability/tracing.ts` and `src/observability/metrics.ts`.
- [X] T009 Implement PostgreSQL pool in `src/db/client.ts`.
- [X] T010 Create SQL migrations in `src/db/migrations/` (admin users/sessions, sources, credentials, integrations, health checks, routes, dashboard links, redaction rules, audit events) and migration runner `src/db/migrate.ts`.
- [X] T011 Implement request-context hook in `src/http/hooks/request-context-hook.ts`.
- [X] T012 Implement Fastify app factory in `src/app.ts` and process entrypoint `src/main.ts`.
- [X] T013 Implement health routes in `src/http/routes/health.routes.ts` (`/health/live`, `/health/ready`).

**Checkpoint**: App boots, health endpoints respond, DB migrations run.

---

## Phase 3: User Story 1 - Register Telemetry From External Applications (Priority: P1) 🎯 MVP

**Goal**: External apps send OTLP logs/traces/metrics with a source key; Ophir authenticates, audits, and forwards to the Collector.

**Independent Test**: Submit log/trace/metric from a registered source → `202`; unknown source → `401`; both produce audit events.

### Tests for User Story 1

- [X] T014 [P] [US1] Unit test source-key auth in `tests/unit/source-auth.test.ts`.
- [X] T015 [P] [US1] Unit test routing policy in `tests/unit/routing-policy.test.ts`.
- [X] T016 [P] [US1] Unit test redaction policy in `tests/unit/redaction-policy.test.ts`.
- [X] T017 [P] [US1] Unit test audit service in `tests/unit/audit.test.ts`.
- [X] T018 [P] [US1] Contract test ingestion endpoints in `tests/contract/otel-proxy.contract.test.ts`.

### Implementation for User Story 1

- [X] T019 [P] [US1] Telemetry domain types in `src/telemetry/telemetry-types.ts`.
- [X] T020 [P] [US1] Audit repository `src/audit/audit.repository.ts` and service `src/audit/audit.service.ts`.
- [X] T021 [P] [US1] Source repository `src/sources/source.repository.ts`.
- [X] T022 [US1] Source credential service `src/sources/source-credential.service.ts` (hash/verify, prefix, rotation).
- [X] T023 [US1] Source service `src/sources/source.service.ts`.
- [X] T024 [US1] Routing policy service `src/telemetry/routing-policy.service.ts`.
- [X] T025 [US1] Redaction policy service `src/telemetry/redaction-policy.service.ts`.
- [X] T026 [US1] OTLP proxy service `src/telemetry/otel-proxy.service.ts` (forward raw body+content-type to Collector with routing headers).
- [X] T027 [US1] Source auth hook `src/http/hooks/source-auth-hook.ts`.
- [X] T028 [US1] OTLP schemas `src/http/schemas/otel.schemas.ts` and proxy routes `src/http/routes/otel-proxy.routes.ts` (raw body parsers for protobuf + json).
- [X] T029 [US1] Register raw-body content-type parsers and ingestion routes in `src/app.ts`.

**Checkpoint**: Ingestion path authenticates, audits, and forwards; rejects unknown sources.

---

## Phase 4: User Story 2 - Admins Inspect Consolidated Telemetry (Priority: P2)

**Goal**: Admin login + RBAC; manage sources and credentials; discover protected Grafana dashboard links; deny non-admins.

**Independent Test**: Login as admin → manage sources + list dashboard links; non-admin/unauthenticated → denied with audit event.

### Tests for User Story 2

- [X] T030 [P] [US2] Contract test admin API in `tests/contract/admin-api.contract.test.ts`.
- [X] T031 [P] [US2] Integration test auth/RBAC in `tests/integration/auth-rbac.integration.test.ts`.

### Implementation for User Story 2

- [X] T032 [P] [US2] Password service `src/auth/password.service.ts` (scrypt hash/verify).
- [X] T033 [P] [US2] JWT service `src/auth/jwt.service.ts` (jose sign/verify).
- [X] T034 [US2] Admin auth service `src/auth/admin-auth.service.ts` (login, session creation, lookup).
- [X] T035 [US2] Admin auth hook `src/http/hooks/admin-auth-hook.ts` (bearer verify + RBAC + denied-view audit).
- [X] T036 [P] [US2] Auth schemas `src/http/schemas/auth.schemas.ts` and routes `src/http/routes/auth.routes.ts` (`/v1/auth/login`, `/v1/me`).
- [X] T037 [P] [US2] Source schemas `src/http/schemas/sources.schemas.ts` and routes `src/http/routes/sources.routes.ts` (CRUD + credential creation).
- [X] T038 [P] [US2] Dashboard link service `src/integrations/dashboard-link.service.ts` and routes `src/http/routes/dashboards.routes.ts`.
- [X] T039 [US2] Wire admin/source/dashboard routes + admin-auth hook into `src/app.ts`.

**Checkpoint**: Admin APIs protected by RBAC; non-admin access denied + audited.

---

## Phase 5: User Story 3 - Monitor Telemetry Backend Health (Priority: P3)

**Goal**: Probe Collector/Loki/Tempo/Prometheus/Grafana; expose health to admins; feed readiness.

**Independent Test**: With a backend down, `/v1/integrations` shows it degraded/unavailable; recovery shows healthy.

### Tests for User Story 3

- [X] T040 [P] [US3] Integration test for integration health in `tests/integration/integration-health.integration.test.ts`.

### Implementation for User Story 3

- [X] T041 [P] [US3] Integration repository `src/integrations/integration.repository.ts`.
- [X] T042 [US3] Integration health service `src/integrations/integration-health.service.ts` (probes + status persistence + scheduler).
- [X] T043 [P] [US3] Integration schemas `src/http/schemas/integrations.schemas.ts` and routes `src/http/routes/integrations.routes.ts`.
- [X] T044 [US3] Wire integrations route + readiness checks + background probe into `src/app.ts`/`src/main.ts`.

**Checkpoint**: Integration health visible to admins and wired to readiness.

---

## Phase 6: Local Observability Stack (Infra)

**Purpose**: Docker Compose stack + telemetry routing config + Grafana provisioning.

- [X] T045 [P] `infra/otel-collector/config.yaml` (OTLP receivers → Loki/Tempo/Prometheus exporters + redaction processors).
- [X] T046 [P] `infra/prometheus/prometheus.yml` (scrape Collector + Ophir).
- [X] T047 [P] `infra/loki/config.yaml`.
- [X] T048 [P] `infra/tempo/config.yaml`.
- [X] T049 [P] Grafana provisioning: `infra/grafana/provisioning/datasources/datasources.yml` and `infra/grafana/provisioning/dashboards/*` + starter dashboard.
- [X] T050 `infra/docker-compose.yml` wiring PostgreSQL, Collector, Loki, Tempo, Prometheus, Grafana, and Ophir.
- [X] T051 [P] `Dockerfile` for the Ophir service.

---

## Phase 7: Scripts & Seed

- [X] T052 Admin create script `scripts/create-admin.ts` (`npm run admin:create`).
- [X] T053 Integration seed in migrations/bootstrap so default Collector/Loki/Tempo/Prometheus/Grafana integrations exist.

---

## Phase 8: Polish & Validation

- [X] T054 Integration test telemetry flow `tests/integration/telemetry-flow.integration.test.ts`.
- [X] T055 [P] `README.md` with dependency tables, architecture summary, and quickstart commands.
- [X] T056 Run `npm install`, `npm run typecheck`, `npm test`; fix issues.
- [X] T057 Validate `quickstart.md` flow against the implemented endpoints.

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → **Foundational (Phase 2)** blocks everything.
- **US1 (Phase 3)** is the MVP and depends only on Foundational.
- **US2 (Phase 4)** depends on Foundational; reuses source repository from US1.
- **US3 (Phase 5)** depends on Foundational; reuses admin-auth hook from US2 for its protected route.
- **Infra (Phase 6)** can be built in parallel with application phases.
- **Polish (Phase 8)** last.

## Implementation Strategy

1. Setup + Foundational.
2. US1 ingestion (MVP) → validate accept/reject + audit.
3. US2 admin RBAC + registry + dashboards.
4. US3 integration health.
5. Infra stack + Grafana provisioning.
6. Tests + README + quickstart validation.
