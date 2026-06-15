import type { AdminUser } from "../auth/admin-auth.service.js";
import type { SourceApplication } from "../telemetry/telemetry-types.js";
import type { TelemetryIntegration } from "../integrations/integration.repository.js";

/** Public admin shape returned by the API (no password hash, no timestamps). */
export function toAdminApi(admin: AdminUser): {
  id: string;
  email: string;
  displayName: string;
  role: "admin";
  status: "active" | "disabled";
} {
  return {
    id: admin.id,
    email: admin.email,
    displayName: admin.displayName,
    role: admin.role,
    status: admin.status,
  };
}

/** Public source application shape with ISO timestamps. */
export function toSourceApi(source: SourceApplication): Record<string, unknown> {
  return {
    id: source.id,
    slug: source.slug,
    displayName: source.displayName,
    environment: source.environment,
    ...(source.ownerName ? { ownerName: source.ownerName } : {}),
    ...(source.ownerContact ? { ownerContact: source.ownerContact } : {}),
    status: source.status,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
  };
}

/** Public integration shape with current health status. */
export function toIntegrationApi(integration: TelemetryIntegration): Record<string, unknown> {
  return {
    id: integration.id,
    kind: integration.kind,
    name: integration.name,
    baseUrl: integration.baseUrl,
    status: integration.status,
    ...(integration.lastCheckedAt
      ? { lastCheckedAt: integration.lastCheckedAt.toISOString() }
      : {}),
    ...(integration.lastError ? { lastError: integration.lastError } : {}),
  };
}
