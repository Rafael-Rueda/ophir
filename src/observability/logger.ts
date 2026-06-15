import { pino, type Logger, type LoggerOptions } from "pino";
import { getEnv } from "../config/env.js";
import { SOURCE_KEY_HEADER } from "../config/runtime.js";

/**
 * Builds Pino logger options. Sensitive request headers are redacted so source
 * keys, cookies, and authorization tokens never reach logs.
 */
export function buildLoggerOptions(): LoggerOptions {
  const env = getEnv();
  const usePretty = env.NODE_ENV === "development";

  return {
    level: env.LOG_LEVEL,
    base: { service: env.OTEL_SERVICE_NAME },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        `req.headers["${SOURCE_KEY_HEADER}"]`,
        'req.headers["set-cookie"]',
      ],
      remove: true,
    },
    ...(usePretty
      ? {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "SYS:standard", ignore: "pid,hostname" },
          },
        }
      : {}),
  };
}

/** Shared logger instance for scripts and non-Fastify contexts. */
export function createLogger(): Logger {
  return pino(buildLoggerOptions());
}

export const logger: Logger = createLogger();
