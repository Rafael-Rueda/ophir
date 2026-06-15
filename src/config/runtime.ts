/**
 * Runtime constants that are not environment-specific. Centralizing these
 * keeps header names, role values, and routing paths consistent across the app.
 */

export const SERVICE_NAME = "ophir";

/** HTTP header carrying the source application ingestion credential. */
export const SOURCE_KEY_HEADER = "x-ophir-source-key";

/** Headers Ophir attaches to forwarded telemetry for downstream routing. */
export const FORWARD_HEADERS = {
  sourceId: "x-ophir-source-id",
  sourceSlug: "x-ophir-source-slug",
  environment: "x-ophir-environment",
  requestId: "x-ophir-request-id",
} as const;

/** Request id header echoed back to callers. */
export const REQUEST_ID_HEADER = "x-request-id";

/** W3C trace context header. */
export const TRACEPARENT_HEADER = "traceparent";

/** Supported telemetry signal types in v1. */
export const TELEMETRY_TYPES = ["logs", "traces", "metrics"] as const;
export type TelemetrySignal = (typeof TELEMETRY_TYPES)[number];

/** Maps a telemetry signal to its OTLP/HTTP collector path. */
export const COLLECTOR_SIGNAL_PATHS: Record<TelemetrySignal, string> = {
  logs: "/v1/logs",
  traces: "/v1/traces",
  metrics: "/v1/metrics",
};

/** Only role supported in v1. */
export const ADMIN_ROLE = "admin" as const;

/** Maximum size of an accepted OTLP body before rejection (5 MiB). */
export const MAX_TELEMETRY_BODY_BYTES = 5 * 1024 * 1024;

/** Content types accepted on ingestion endpoints. */
export const OTLP_CONTENT_TYPES = {
  protobuf: "application/x-protobuf",
  json: "application/json",
} as const;
