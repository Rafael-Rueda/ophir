import { getEnv } from "../config/env.js";
import { logger } from "../observability/logger.js";
import {
  insertHealthCheck,
  listIntegrations,
  updateIntegrationStatus,
  upsertIntegration,
  type HealthCheckStatus,
  type IntegrationKind,
  type TelemetryIntegration,
} from "./integration.repository.js";
import { seedDefaultDashboardLinks } from "./dashboard-link.service.js";

/** Per-kind HTTP health endpoints used by probes. */
const HEALTH_PATHS: Record<IntegrationKind, string> = {
  collector: "/ready", // health_check extension (port 13133, path /ready)
  loki: "/ready",
  tempo: "/ready",
  prometheus: "/-/healthy",
  grafana: "/api/health",
};

interface ProbeResult {
  status: HealthCheckStatus;
  latencyMs?: number;
  errorCode?: string;
  errorMessage?: string;
}

/** Seeds the default local integrations and dashboard links from env config. */
export async function seedDefaultIntegrations(): Promise<void> {
  const env = getEnv();
  const defaults: Array<{ kind: IntegrationKind; name: string; baseUrl: string }> = [
    { kind: "collector", name: "OpenTelemetry Collector", baseUrl: env.COLLECTOR_URL },
    { kind: "loki", name: "Loki", baseUrl: env.LOKI_URL },
    { kind: "tempo", name: "Tempo", baseUrl: env.TEMPO_URL },
    { kind: "prometheus", name: "Prometheus", baseUrl: env.PROMETHEUS_URL },
    { kind: "grafana", name: "Grafana", baseUrl: env.GRAFANA_URL },
  ];

  for (const integration of defaults) {
    await upsertIntegration(integration);
  }

  await seedDefaultDashboardLinks();
}

async function probeIntegration(integration: TelemetryIntegration): Promise<ProbeResult> {
  const env = getEnv();
  const path = HEALTH_PATHS[integration.kind] ?? "/";
  const url = `${integration.baseUrl.replace(/\/+$/, "")}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.HEALTH_PROBE_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, { method: "GET", signal: controller.signal });
    const latencyMs = Date.now() - startedAt;
    if (response.ok) {
      return { status: "healthy", latencyMs };
    }
    return {
      status: "degraded",
      latencyMs,
      errorCode: String(response.status),
      errorMessage: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      status: "unavailable",
      errorCode: "unreachable",
      errorMessage:
        error instanceof Error && error.name === "AbortError"
          ? "probe timed out"
          : error instanceof Error
            ? error.message
            : "unreachable",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Probes every integration, persisting status and an append-only health check. */
export async function runHealthChecks(): Promise<TelemetryIntegration[]> {
  const integrations = await listIntegrations();

  await Promise.all(
    integrations.map(async (integration) => {
      const result = await probeIntegration(integration);
      const now = new Date();
      await updateIntegrationStatus(integration.id, {
        status: result.status,
        lastCheckedAt: now,
        lastSuccessAt: result.status === "healthy" ? now : undefined,
        lastError: result.errorMessage ?? null,
      });
      await insertHealthCheck({
        integrationId: integration.id,
        status: result.status,
        latencyMs: result.latencyMs,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
    }),
  );

  return listIntegrations();
}

export async function getIntegrations(): Promise<TelemetryIntegration[]> {
  return listIntegrations();
}

let schedulerTimer: NodeJS.Timeout | undefined;

/** Starts periodic background health probing. Safe to call once at startup. */
export function startHealthProbeScheduler(): void {
  const env = getEnv();
  if (!env.HEALTH_PROBE_ENABLED) {
    logger.info("Integration health probes are disabled");
    return;
  }
  if (schedulerTimer) return;

  const tick = (): void => {
    runHealthChecks().catch((error) => {
      logger.warn({ err: error }, "Integration health check run failed");
    });
  };

  // Initial probe shortly after startup, then on a fixed interval.
  setTimeout(tick, 2000).unref?.();
  schedulerTimer = setInterval(tick, env.HEALTH_PROBE_INTERVAL_MS);
  schedulerTimer.unref?.();
}

export function stopHealthProbeScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = undefined;
  }
}
