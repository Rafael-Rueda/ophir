/**
 * OpenTelemetry bootstrap for Ophir's own telemetry.
 *
 * IMPORTANT: This module must be preloaded BEFORE the application code so the
 * Node SDK can patch libraries (HTTP, Fastify, pg) early enough to record
 * useful spans. Use:
 *   - dev:  tsx --import ./src/observability/instrumentation.ts ./src/main.ts
 *   - prod: node --import ./dist/observability/instrumentation.js ./dist/main.js
 *
 * Dynamic imports + try/catch keep the service running even if the OTel stack
 * is misconfigured or unavailable; self-observability is best-effort.
 */
import { getEnv } from "../config/env.js";

const env = getEnv();

// Guard against double-initialization: OpenTelemetry's ESM module hook can
// re-evaluate this preload module, which would otherwise start several SDKs.
const globalState = globalThis as typeof globalThis & { __ophirOtelStarted?: boolean };

if (!env.OTEL_SDK_DISABLED && !globalState.__ophirOtelStarted) {
  globalState.__ophirOtelStarted = true;

  // Let the SDK's env resource detector pick up the service name.
  process.env.OTEL_SERVICE_NAME ??= env.OTEL_SERVICE_NAME;

  try {
    const [
      { NodeSDK },
      { getNodeAutoInstrumentations },
      { FastifyInstrumentation },
      { OTLPTraceExporter },
      { OTLPMetricExporter },
      { PeriodicExportingMetricReader },
    ] = await Promise.all([
      import("@opentelemetry/sdk-node"),
      import("@opentelemetry/auto-instrumentations-node"),
      import("@opentelemetry/instrumentation-fastify"),
      import("@opentelemetry/exporter-trace-otlp-http"),
      import("@opentelemetry/exporter-metrics-otlp-http"),
      import("@opentelemetry/sdk-metrics"),
    ]);

    const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/+$/, "");

    const sdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
      metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
        exportIntervalMillis: 15_000,
      }),
      instrumentations: [getNodeAutoInstrumentations(), new FastifyInstrumentation()],
    });

    sdk.start();

    const shutdown = (): void => {
      void sdk.shutdown().catch(() => undefined);
    };
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);

    console.log(`[ophir] OpenTelemetry SDK started, exporting to ${endpoint}`);
  } catch (error) {
    console.error(
      "[ophir] OpenTelemetry SDK failed to start; continuing without self-instrumentation",
      error,
    );
  }
}
