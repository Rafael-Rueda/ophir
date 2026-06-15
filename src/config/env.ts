import { z } from "zod";

/**
 * Parses a boolean from common string representations because environment
 * variables are always strings (e.g. "false" must not coerce to `true`).
 */
const booleanFromEnv = (defaultValue: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .default(defaultValue)
    .transform((value) => {
      if (typeof value === "boolean") return value;
      return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
    });

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().max(65535).default(8080),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  // PostgreSQL control-plane database.
  DATABASE_URL: z.string().min(1).default("postgres://ophir:ophir@localhost:5442/ophir"),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  // Admin authentication.
  JWT_SECRET: z.string().min(32).default("ophir-development-insecure-jwt-secret-change-me"),
  JWT_ISSUER: z.string().min(1).default("ophir"),
  JWT_AUDIENCE: z.string().min(1).default("ophir-admin"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),

  // Source ingestion credentials.
  SOURCE_KEY_PREFIX: z.string().min(1).default("ophir_src_"),

  // OpenTelemetry Collector forwarding target (Ophir appends /v1/{signal}).
  COLLECTOR_OTLP_HTTP_URL: z.string().url().default("http://localhost:4318"),
  COLLECTOR_FORWARD_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

  // Integration health probe targets.
  COLLECTOR_URL: z.string().url().default("http://localhost:13133"),
  LOKI_URL: z.string().url().default("http://localhost:3100"),
  TEMPO_URL: z.string().url().default("http://localhost:3200"),
  PROMETHEUS_URL: z.string().url().default("http://localhost:9090"),
  GRAFANA_URL: z.string().url().default("http://localhost:3000"),
  // Browser-reachable Grafana base used to build clickable dashboard links.
  GRAFANA_PUBLIC_URL: z.string().url().default("http://localhost:3000"),
  HEALTH_PROBE_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  HEALTH_PROBE_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  HEALTH_PROBE_ENABLED: booleanFromEnv(true),

  // Self-observability.
  OTEL_SDK_DISABLED: booleanFromEnv(false),
  OTEL_SERVICE_NAME: z.string().min(1).default("ophir"),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().default("http://localhost:4318"),

  // Optional bootstrap admin (used by `npm run admin:create`).
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12).optional(),
  BOOTSTRAP_ADMIN_NAME: z.string().min(1).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Parses and validates environment variables from a record (defaults to
 * `process.env`). Throws a readable error when validation fails.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

let cachedEnv: Env | undefined;

/**
 * Returns a cached, validated env object. The first call parses `process.env`.
 */
export function getEnv(): Env {
  cachedEnv ??= loadEnv();
  return cachedEnv;
}

/** Resets the env cache. Intended for tests only. */
export function resetEnvCache(): void {
  cachedEnv = undefined;
}
