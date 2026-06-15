import type { FastifyInstance } from "fastify";
import { pingDatabase } from "../../db/client.js";
import { getIntegrations } from "../../integrations/integration-health.service.js";
import type { IntegrationStatus } from "../../integrations/integration.repository.js";

interface ReadinessCheck {
  name: string;
  status: "healthy" | "degraded" | "unavailable";
  message?: string;
}

/** Maps stored integration status to the readiness check enum (no `unknown`). */
function toCheckStatus(status: IntegrationStatus): ReadinessCheck["status"] {
  return status === "unknown" ? "degraded" : status;
}

/**
 * Liveness and readiness probes.
 * - `/health/live` only proves the process is running.
 * - `/health/ready` verifies the control-plane database is reachable.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health/live", async () => ({ status: "ok" as const }));

  app.get("/health/ready", async (_request, reply) => {
    const checks: ReadinessCheck[] = [];

    const databaseReachable = await pingDatabase();
    checks.push({
      name: "database",
      status: databaseReachable ? "healthy" : "unavailable",
      ...(databaseReachable ? {} : { message: "PostgreSQL is not reachable" }),
    });

    // Surface integration health (informational): integration problems must be
    // visible but do not, by themselves, make the service "not ready".
    if (databaseReachable) {
      const integrations = await getIntegrations().catch(() => []);
      for (const integration of integrations) {
        checks.push({
          name: integration.kind,
          status: toCheckStatus(integration.status),
          ...(integration.lastError ? { message: integration.lastError } : {}),
        });
      }
    }

    // Readiness is gated on the control-plane database only.
    const ready = databaseReachable;
    reply.code(ready ? 200 : 503);
    return { status: ready ? ("ready" as const) : ("not_ready" as const), checks };
  });
}
