-- Ophir control-plane schema.
-- Stores admins, source registry, credentials, integrations, health, routes,
-- dashboard links, redaction policy, and audit events. No raw telemetry.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Admin users -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email         text NOT NULL UNIQUE,
  display_name  text NOT NULL,
  password_hash text,
  role          text NOT NULL DEFAULT 'admin' CHECK (role = 'admin'),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

-- Admin sessions ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_sessions (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  admin_user_id   text NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
  token_family_id text NOT NULL,
  expires_at      timestamptz NOT NULL,
  revoked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_user_id ON admin_sessions (admin_user_id);

-- Source applications -----------------------------------------------------
CREATE TABLE IF NOT EXISTS source_applications (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  slug          text NOT NULL,
  display_name  text NOT NULL,
  environment   text NOT NULL,
  owner_name    text,
  owner_contact text,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug, environment)
);

-- Source credentials ------------------------------------------------------
CREATE TABLE IF NOT EXISTS source_credentials (
  id                    text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  source_application_id text NOT NULL REFERENCES source_applications (id) ON DELETE CASCADE,
  key_prefix            text NOT NULL,
  key_hash              text NOT NULL UNIQUE,
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'rotated')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz,
  last_used_at          timestamptz,
  rotated_at            timestamptz
);
CREATE INDEX IF NOT EXISTS idx_source_credentials_source ON source_credentials (source_application_id);

-- Telemetry integrations --------------------------------------------------
CREATE TABLE IF NOT EXISTS telemetry_integrations (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  kind            text NOT NULL CHECK (kind IN ('collector', 'loki', 'tempo', 'prometheus', 'grafana')),
  name            text NOT NULL,
  base_url        text NOT NULL,
  status          text NOT NULL DEFAULT 'unknown' CHECK (status IN ('healthy', 'degraded', 'unavailable', 'unknown')),
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, name)
);

-- Integration health checks ----------------------------------------------
CREATE TABLE IF NOT EXISTS integration_health_checks (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  integration_id text NOT NULL REFERENCES telemetry_integrations (id) ON DELETE CASCADE,
  status         text NOT NULL CHECK (status IN ('healthy', 'degraded', 'unavailable')),
  latency_ms     integer,
  error_code     text,
  error_message  text,
  checked_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_health_checks_integration ON integration_health_checks (integration_id, checked_at DESC);

-- Telemetry routes --------------------------------------------------------
CREATE TABLE IF NOT EXISTS telemetry_routes (
  id                      text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  source_application_id   text NOT NULL REFERENCES source_applications (id) ON DELETE CASCADE,
  telemetry_type          text NOT NULL CHECK (telemetry_type IN ('logs', 'traces', 'metrics')),
  collector_endpoint_path text NOT NULL,
  enabled                 boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_application_id, telemetry_type)
);

-- Dashboard links ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS dashboard_links (
  id                    text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  source_application_id text REFERENCES source_applications (id) ON DELETE CASCADE,
  integration_id        text REFERENCES telemetry_integrations (id) ON DELETE SET NULL,
  title                 text NOT NULL,
  url_template          text NOT NULL,
  telemetry_type        text NOT NULL CHECK (telemetry_type IN ('logs', 'traces', 'metrics', 'overview')),
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dashboard_links_source ON dashboard_links (source_application_id);

-- Redaction rules ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS redaction_rules (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name       text NOT NULL,
  match_path text NOT NULL,
  action     text NOT NULL CHECK (action IN ('drop', 'mask', 'hash')),
  enabled    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Audit events ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_events (
  id                    text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_type            text NOT NULL,
  actor_type            text NOT NULL CHECK (actor_type IN ('admin', 'source', 'system', 'anonymous')),
  actor_id              text,
  source_application_id text REFERENCES source_applications (id) ON DELETE SET NULL,
  result                text NOT NULL CHECK (result IN ('allowed', 'denied', 'failed')),
  reason                text,
  request_id            text,
  correlation_id        text,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_event_type ON audit_events (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_source ON audit_events (source_application_id);
