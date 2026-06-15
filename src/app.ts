import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { getEnv } from "./config/env.js";
import { MAX_TELEMETRY_BODY_BYTES, REQUEST_ID_HEADER } from "./config/runtime.js";
import { buildLoggerOptions } from "./observability/logger.js";
import { adminRequestsTotal } from "./observability/metrics.js";
import { isAppError, toErrorResponse } from "./shared/errors.js";
import { newId } from "./shared/ids.js";
import { registerRequestContext } from "./http/hooks/request-context-hook.js";
import { healthRoutes } from "./http/routes/health.routes.js";
import { authRoutes } from "./http/routes/auth.routes.js";
import { sourcesRoutes } from "./http/routes/sources.routes.js";
import { integrationsRoutes } from "./http/routes/integrations.routes.js";
import { dashboardRoutes } from "./http/routes/dashboards.routes.js";
import { otelProxyRoutes } from "./http/routes/otel-proxy.routes.js";

export interface BuildAppOptions {
  /** Disable the Fastify logger (useful to reduce noise in tests). */
  logger?: boolean;
}

/**
 * Creates and configures the Fastify application. Used by both the runtime
 * entrypoint and tests (via `app.inject`).
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const enableLogger = options.logger ?? true;

  const app = Fastify({
    logger: enableLogger ? buildLoggerOptions() : false,
    bodyLimit: MAX_TELEMETRY_BODY_BYTES,
    trustProxy: true,
    genReqId: (req) => {
      const incoming = req.headers["x-request-id"];
      return typeof incoming === "string" && incoming.length > 0 ? incoming : newId();
    },
  });

  registerRequestContext(app);
  registerErrorHandlers(app);

  // Admin API request counter.
  app.addHook("onResponse", async (request, reply) => {
    if (request.url.startsWith("/v1/")) {
      adminRequestsTotal.add(1, {
        method: request.method,
        status: String(reply.statusCode),
      });
    }
  });

  // Health probes (no prefix).
  await app.register(healthRoutes);

  // Admin control-plane API.
  await app.register(authRoutes, { prefix: "/v1" });
  await app.register(sourcesRoutes, { prefix: "/v1" });
  await app.register(integrationsRoutes, { prefix: "/v1" });
  await app.register(dashboardRoutes, { prefix: "/v1" });

  // OTLP-compatible ingestion proxy (encapsulated raw-body parsers live inside).
  await app.register(otelProxyRoutes, { prefix: "/otel" });

  return app;
}

/** Maps thrown errors to the `ErrorResponse` contract shape. */
function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;

    if (isAppError(error)) {
      request.log.warn({ err: error, code: error.code }, "Request failed");
      reply.code(error.statusCode).send(toErrorResponse(error, requestId));
      return;
    }

    if (error instanceof ZodError) {
      reply.code(400).send({
        error: { code: "bad_request", message: "Request validation failed" },
        requestId,
      });
      return;
    }

    const fastifyError = error as { validation?: unknown; statusCode?: number; message?: string };

    // Fastify schema validation errors.
    if (fastifyError.validation) {
      reply.code(400).send({
        error: { code: "bad_request", message: fastifyError.message ?? "Validation failed" },
        requestId,
      });
      return;
    }

    const statusCode =
      typeof fastifyError.statusCode === "number" &&
      fastifyError.statusCode >= 400 &&
      fastifyError.statusCode < 600
        ? fastifyError.statusCode
        : 500;

    if (statusCode >= 500) {
      request.log.error({ err: error }, "Unhandled error");
    }

    reply.code(statusCode).send({
      error: {
        code: statusCode === 500 ? "internal_error" : "request_error",
        message: statusCode === 500 ? "Internal server error" : (fastifyError.message ?? "Request error"),
      },
      requestId,
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.header(REQUEST_ID_HEADER, request.id);
    reply.code(404).send({
      error: { code: "not_found", message: `Route ${request.method} ${request.url} not found` },
      requestId: request.id,
    });
  });
}

export { getEnv };
