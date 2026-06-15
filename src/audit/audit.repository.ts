import { query } from "../db/client.js";

export type AuditActorType = "admin" | "source" | "system" | "anonymous";
export type AuditResult = "allowed" | "denied" | "failed";

export interface AuditEventInput {
  eventType: string;
  actorType: AuditActorType;
  actorId?: string | null;
  sourceApplicationId?: string | null;
  result: AuditResult;
  reason?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuditEventRecord {
  id: string;
  eventType: string;
  actorType: AuditActorType;
  actorId: string | null;
  sourceApplicationId: string | null;
  result: AuditResult;
  reason: string | null;
  requestId: string | null;
  correlationId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

type AuditRow = {
  id: string;
  event_type: string;
  actor_type: AuditActorType;
  actor_id: string | null;
  source_application_id: string | null;
  result: AuditResult;
  reason: string | null;
  request_id: string | null;
  correlation_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

function mapAudit(row: AuditRow): AuditEventRecord {
  return {
    id: row.id,
    eventType: row.event_type,
    actorType: row.actor_type,
    actorId: row.actor_id,
    sourceApplicationId: row.source_application_id,
    result: row.result,
    reason: row.reason,
    requestId: row.request_id,
    correlationId: row.correlation_id,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

export async function insertAuditEvent(input: AuditEventInput): Promise<void> {
  await query(
    `INSERT INTO audit_events
       (event_type, actor_type, actor_id, source_application_id, result, reason, request_id, correlation_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.eventType,
      input.actorType,
      input.actorId ?? null,
      input.sourceApplicationId ?? null,
      input.result,
      input.reason ?? null,
      input.requestId ?? null,
      input.correlationId ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

export async function listRecentAuditEvents(limit = 100): Promise<AuditEventRecord[]> {
  const { rows } = await query<AuditRow>(
    `SELECT * FROM audit_events ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map(mapAudit);
}

export async function countAuditEvents(eventType?: string): Promise<number> {
  const { rows } = eventType
    ? await query<{ count: string }>(
        `SELECT count(*)::text AS count FROM audit_events WHERE event_type = $1`,
        [eventType],
      )
    : await query<{ count: string }>(`SELECT count(*)::text AS count FROM audit_events`);
  return Number(rows[0]?.count ?? 0);
}
