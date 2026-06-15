import { insertAuditEvent, type AuditEventInput } from "./audit.repository.js";
import { redactObject } from "../telemetry/redaction-policy.service.js";
import { logger } from "../observability/logger.js";
import type { TelemetrySignal } from "../config/runtime.js";

/** Stable machine-readable audit event types. */
export const AuditEventTypes = {
  ingestionAccepted: "telemetry.ingestion.accepted",
  ingestionDenied: "telemetry.ingestion.denied",
  ingestionFailed: "telemetry.ingestion.failed",
  adminLoginSucceeded: "admin.login.succeeded",
  adminLoginFailed: "admin.login.failed",
  adminViewDenied: "admin.view.denied",
  sourceCreated: "source.created",
  sourceUpdated: "source.updated",
  credentialCreated: "source.credential.created",
} as const;

/**
 * Writes an audit event. Audit failures are logged but never thrown so they
 * cannot break the primary request path.
 */
export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    await insertAuditEvent({
      ...input,
      metadata: input.metadata ? redactObject(input.metadata) : undefined,
    });
  } catch (error) {
    logger.error({ err: error, eventType: input.eventType }, "Failed to write audit event");
  }
}

export async function recordIngestionAccepted(params: {
  sourceId: string;
  signal: TelemetrySignal;
  requestId: string;
  correlationId?: string;
  keyPrefix?: string;
}): Promise<void> {
  await recordAuditEvent({
    eventType: AuditEventTypes.ingestionAccepted,
    actorType: "source",
    actorId: params.sourceId,
    sourceApplicationId: params.sourceId,
    result: "allowed",
    requestId: params.requestId,
    correlationId: params.correlationId ?? null,
    metadata: { signal: params.signal, keyPrefix: params.keyPrefix },
  });
}

export async function recordIngestionDenied(params: {
  reason: string;
  sourceId?: string;
  requestId: string;
  signal?: TelemetrySignal;
}): Promise<void> {
  await recordAuditEvent({
    eventType: AuditEventTypes.ingestionDenied,
    actorType: params.sourceId ? "source" : "anonymous",
    actorId: params.sourceId ?? null,
    sourceApplicationId: params.sourceId ?? null,
    result: "denied",
    reason: params.reason,
    requestId: params.requestId,
    metadata: { signal: params.signal },
  });
}

export async function recordIngestionFailed(params: {
  sourceId: string;
  signal: TelemetrySignal;
  requestId: string;
  reason: string;
}): Promise<void> {
  await recordAuditEvent({
    eventType: AuditEventTypes.ingestionFailed,
    actorType: "source",
    actorId: params.sourceId,
    sourceApplicationId: params.sourceId,
    result: "failed",
    reason: params.reason,
    requestId: params.requestId,
    metadata: { signal: params.signal },
  });
}

export async function recordAdminLogin(params: {
  adminId?: string;
  email: string;
  requestId: string;
  success: boolean;
  reason?: string;
}): Promise<void> {
  await recordAuditEvent({
    eventType: params.success
      ? AuditEventTypes.adminLoginSucceeded
      : AuditEventTypes.adminLoginFailed,
    actorType: "admin",
    actorId: params.adminId ?? null,
    result: params.success ? "allowed" : "denied",
    reason: params.reason ?? null,
    requestId: params.requestId,
    metadata: { email: params.email },
  });
}

export async function recordAdminViewDenied(params: {
  requestId: string;
  reason: string;
  actorId?: string;
  route?: string;
}): Promise<void> {
  await recordAuditEvent({
    eventType: AuditEventTypes.adminViewDenied,
    actorType: params.actorId ? "admin" : "anonymous",
    actorId: params.actorId ?? null,
    result: "denied",
    reason: params.reason,
    requestId: params.requestId,
    metadata: { route: params.route },
  });
}

export async function recordSourceChange(params: {
  eventType: typeof AuditEventTypes.sourceCreated | typeof AuditEventTypes.sourceUpdated;
  adminId: string;
  sourceId: string;
  requestId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await recordAuditEvent({
    eventType: params.eventType,
    actorType: "admin",
    actorId: params.adminId,
    sourceApplicationId: params.sourceId,
    result: "allowed",
    requestId: params.requestId,
    metadata: params.metadata,
  });
}

export async function recordCredentialCreated(params: {
  adminId: string;
  sourceId: string;
  requestId: string;
  keyPrefix: string;
}): Promise<void> {
  await recordAuditEvent({
    eventType: AuditEventTypes.credentialCreated,
    actorType: "admin",
    actorId: params.adminId,
    sourceApplicationId: params.sourceId,
    result: "allowed",
    requestId: params.requestId,
    metadata: { keyPrefix: params.keyPrefix },
  });
}
