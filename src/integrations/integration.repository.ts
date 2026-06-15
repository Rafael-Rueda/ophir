import { query } from "../db/client.js";

export type IntegrationKind = "collector" | "loki" | "tempo" | "prometheus" | "grafana";
export type IntegrationStatus = "healthy" | "degraded" | "unavailable" | "unknown";
export type HealthCheckStatus = "healthy" | "degraded" | "unavailable";

export interface TelemetryIntegration {
  id: string;
  kind: IntegrationKind;
  name: string;
  baseUrl: string;
  status: IntegrationStatus;
  lastCheckedAt: Date | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type IntegrationRow = {
  id: string;
  kind: IntegrationKind;
  name: string;
  base_url: string;
  status: IntegrationStatus;
  last_checked_at: Date | null;
  last_success_at: Date | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
};

function mapIntegration(row: IntegrationRow): TelemetryIntegration {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    baseUrl: row.base_url,
    status: row.status,
    lastCheckedAt: row.last_checked_at,
    lastSuccessAt: row.last_success_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listIntegrations(): Promise<TelemetryIntegration[]> {
  const { rows } = await query<IntegrationRow>(
    `SELECT * FROM telemetry_integrations ORDER BY kind`,
  );
  return rows.map(mapIntegration);
}

/** Inserts an integration if (kind, name) does not exist; updates base_url otherwise. */
export async function upsertIntegration(input: {
  kind: IntegrationKind;
  name: string;
  baseUrl: string;
}): Promise<TelemetryIntegration> {
  const { rows } = await query<IntegrationRow>(
    `INSERT INTO telemetry_integrations (kind, name, base_url)
     VALUES ($1, $2, $3)
     ON CONFLICT (kind, name)
     DO UPDATE SET base_url = EXCLUDED.base_url, updated_at = now()
     RETURNING *`,
    [input.kind, input.name, input.baseUrl],
  );
  return mapIntegration(rows[0]!);
}

export async function updateIntegrationStatus(
  id: string,
  input: {
    status: IntegrationStatus;
    lastCheckedAt: Date;
    lastSuccessAt?: Date;
    lastError?: string | null;
  },
): Promise<void> {
  await query(
    `UPDATE telemetry_integrations
     SET status = $2,
         last_checked_at = $3,
         last_success_at = COALESCE($4, last_success_at),
         last_error = $5,
         updated_at = now()
     WHERE id = $1`,
    [id, input.status, input.lastCheckedAt, input.lastSuccessAt ?? null, input.lastError ?? null],
  );
}

export async function insertHealthCheck(input: {
  integrationId: string;
  status: HealthCheckStatus;
  latencyMs?: number;
  errorCode?: string;
  errorMessage?: string;
}): Promise<void> {
  await query(
    `INSERT INTO integration_health_checks
       (integration_id, status, latency_ms, error_code, error_message)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      input.integrationId,
      input.status,
      input.latencyMs ?? null,
      input.errorCode ?? null,
      input.errorMessage ?? null,
    ],
  );
}
