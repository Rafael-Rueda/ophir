import type { PoolClient } from "pg";
import { query } from "../db/client.js";
import { COLLECTOR_SIGNAL_PATHS, TELEMETRY_TYPES } from "../config/runtime.js";
import type {
  CredentialStatus,
  SourceApplication,
  SourceCredential,
  SourceStatus,
  TelemetryRoute,
} from "../telemetry/telemetry-types.js";

type SourceRow = {
  id: string;
  slug: string;
  display_name: string;
  environment: string;
  owner_name: string | null;
  owner_contact: string | null;
  status: SourceStatus;
  created_at: Date;
  updated_at: Date;
};

type CredentialRow = {
  id: string;
  source_application_id: string;
  key_prefix: string;
  key_hash: string;
  status: CredentialStatus;
  created_at: Date;
  expires_at: Date | null;
  last_used_at: Date | null;
  rotated_at: Date | null;
};

type RouteRow = {
  id: string;
  source_application_id: string;
  telemetry_type: "logs" | "traces" | "metrics";
  collector_endpoint_path: string;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
};

function mapSource(row: SourceRow): SourceApplication {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    environment: row.environment,
    ownerName: row.owner_name,
    ownerContact: row.owner_contact,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCredential(row: CredentialRow): SourceCredential {
  return {
    id: row.id,
    sourceApplicationId: row.source_application_id,
    keyPrefix: row.key_prefix,
    keyHash: row.key_hash,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    rotatedAt: row.rotated_at,
  };
}

function mapRoute(row: RouteRow): TelemetryRoute {
  return {
    id: row.id,
    sourceApplicationId: row.source_application_id,
    telemetryType: row.telemetry_type,
    collectorEndpointPath: row.collector_endpoint_path,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// --- Source applications ---------------------------------------------------

export interface InsertSourceInput {
  slug: string;
  displayName: string;
  environment: string;
  ownerName?: string | null;
  ownerContact?: string | null;
}

export async function insertSource(input: InsertSourceInput): Promise<SourceApplication> {
  const { rows } = await query<SourceRow>(
    `INSERT INTO source_applications (slug, display_name, environment, owner_name, owner_contact)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.slug,
      input.displayName,
      input.environment,
      input.ownerName ?? null,
      input.ownerContact ?? null,
    ],
  );
  return mapSource(rows[0]!);
}

export async function getSourceById(id: string): Promise<SourceApplication | null> {
  const { rows } = await query<SourceRow>(`SELECT * FROM source_applications WHERE id = $1`, [id]);
  return rows[0] ? mapSource(rows[0]) : null;
}

export async function getSourceBySlugEnvironment(
  slug: string,
  environment: string,
): Promise<SourceApplication | null> {
  const { rows } = await query<SourceRow>(
    `SELECT * FROM source_applications WHERE slug = $1 AND environment = $2`,
    [slug, environment],
  );
  return rows[0] ? mapSource(rows[0]) : null;
}

export async function listSources(): Promise<SourceApplication[]> {
  const { rows } = await query<SourceRow>(
    `SELECT * FROM source_applications ORDER BY created_at DESC`,
  );
  return rows.map(mapSource);
}

export interface UpdateSourceInput {
  displayName?: string;
  ownerName?: string | null;
  ownerContact?: string | null;
  status?: SourceStatus;
}

export async function updateSource(
  id: string,
  input: UpdateSourceInput,
): Promise<SourceApplication | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (input.displayName !== undefined) {
    sets.push(`display_name = $${i++}`);
    values.push(input.displayName);
  }
  if (input.ownerName !== undefined) {
    sets.push(`owner_name = $${i++}`);
    values.push(input.ownerName);
  }
  if (input.ownerContact !== undefined) {
    sets.push(`owner_contact = $${i++}`);
    values.push(input.ownerContact);
  }
  if (input.status !== undefined) {
    sets.push(`status = $${i++}`);
    values.push(input.status);
  }

  if (sets.length === 0) {
    return getSourceById(id);
  }

  sets.push(`updated_at = now()`);
  values.push(id);

  const { rows } = await query<SourceRow>(
    `UPDATE source_applications SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    values,
  );
  return rows[0] ? mapSource(rows[0]) : null;
}

// --- Source credentials ----------------------------------------------------

export interface InsertCredentialInput {
  sourceApplicationId: string;
  keyPrefix: string;
  keyHash: string;
  expiresAt?: Date | null;
}

export async function insertCredential(input: InsertCredentialInput): Promise<SourceCredential> {
  const { rows } = await query<CredentialRow>(
    `INSERT INTO source_credentials (source_application_id, key_prefix, key_hash, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.sourceApplicationId, input.keyPrefix, input.keyHash, input.expiresAt ?? null],
  );
  return mapCredential(rows[0]!);
}

export interface CredentialWithSource {
  credential: SourceCredential;
  source: SourceApplication;
}

export async function getCredentialWithSourceByHash(
  keyHash: string,
): Promise<CredentialWithSource | null> {
  const { rows } = await query<CredentialRow & { source: SourceRow }>(
    `SELECT c.*, to_jsonb(s.*) AS source
     FROM source_credentials c
     JOIN source_applications s ON s.id = c.source_application_id
     WHERE c.key_hash = $1`,
    [keyHash],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    credential: mapCredential(row),
    source: mapSource(row.source),
  };
}

export async function setCredentialStatus(
  id: string,
  status: CredentialStatus,
  rotatedAt?: Date | null,
): Promise<void> {
  await query(
    `UPDATE source_credentials
     SET status = $2, rotated_at = COALESCE($3, rotated_at)
     WHERE id = $1`,
    [id, status, rotatedAt ?? null],
  );
}

export async function markCredentialUsed(id: string): Promise<void> {
  await query(`UPDATE source_credentials SET last_used_at = now() WHERE id = $1`, [id]);
}

export async function listCredentialsBySource(sourceId: string): Promise<SourceCredential[]> {
  const { rows } = await query<CredentialRow>(
    `SELECT * FROM source_credentials WHERE source_application_id = $1 ORDER BY created_at DESC`,
    [sourceId],
  );
  return rows.map(mapCredential);
}

// --- Telemetry routes ------------------------------------------------------

/** Ensures every v1 signal (logs/traces/metrics) has an enabled route. */
export async function ensureDefaultRoutes(
  sourceId: string,
  client?: PoolClient,
): Promise<void> {
  const run = client
    ? (text: string, params: unknown[]) => client.query(text, params)
    : (text: string, params: unknown[]) => query(text, params);

  for (const type of TELEMETRY_TYPES) {
    await run(
      `INSERT INTO telemetry_routes (source_application_id, telemetry_type, collector_endpoint_path)
       VALUES ($1, $2, $3)
       ON CONFLICT (source_application_id, telemetry_type) DO NOTHING`,
      [sourceId, type, COLLECTOR_SIGNAL_PATHS[type]],
    );
  }
}

export async function getRoutesBySource(sourceId: string): Promise<TelemetryRoute[]> {
  const { rows } = await query<RouteRow>(
    `SELECT * FROM telemetry_routes WHERE source_application_id = $1`,
    [sourceId],
  );
  return rows.map(mapRoute);
}
