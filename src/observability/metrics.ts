import { metrics } from "@opentelemetry/api";
import { SERVICE_NAME } from "../config/runtime.js";

const meter = metrics.getMeter(SERVICE_NAME);

/** Total telemetry ingestion requests received, by signal and result. */
export const ingestionRequestsTotal = meter.createCounter("ophir_ingestion_requests_total", {
  description: "Total telemetry ingestion requests received by Ophir.",
});

/** Total telemetry ingestion requests rejected (auth/policy/validation). */
export const ingestionRejectedTotal = meter.createCounter("ophir_ingestion_rejected_total", {
  description: "Total telemetry ingestion requests rejected by Ophir.",
});

/** Total failures forwarding accepted telemetry to the Collector. */
export const collectorForwardFailuresTotal = meter.createCounter(
  "ophir_collector_forward_failures_total",
  { description: "Total failures forwarding telemetry to the OpenTelemetry Collector." },
);

/** Duration of the forward-to-Collector step in seconds. */
export const collectorForwardDuration = meter.createHistogram(
  "ophir_collector_forward_duration_seconds",
  { description: "Duration of forwarding telemetry to the Collector.", unit: "s" },
);

/** Total admin API requests, by route and status. */
export const adminRequestsTotal = meter.createCounter("ophir_admin_requests_total", {
  description: "Total admin API requests handled by Ophir.",
});

/** Records a histogram value measured from a high-resolution start time. */
export function recordDurationSeconds(
  histogram: { record: (value: number, attributes?: Record<string, string>) => void },
  startedAtMs: number,
  attributes?: Record<string, string>,
): void {
  histogram.record((Date.now() - startedAtMs) / 1000, attributes);
}
