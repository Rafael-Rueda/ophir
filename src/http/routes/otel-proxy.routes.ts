import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  MAX_TELEMETRY_BODY_BYTES,
  OTLP_CONTENT_TYPES,
  TRACEPARENT_HEADER,
  type TelemetrySignal,
} from "../../config/runtime.js";
import { BadRequestError, CollectorUnavailableError, ForbiddenError } from "../../shared/errors.js";
import { sourceAuthPreHandler } from "../hooks/source-auth-hook.js";
import { resolveRouteForSource } from "../../telemetry/routing-policy.service.js";
import { forwardToCollector } from "../../telemetry/otel-proxy.service.js";
import {
  recordIngestionAccepted,
  recordIngestionDenied,
  recordIngestionFailed,
} from "../../audit/audit.service.js";
import { ingestionRejectedTotal, ingestionRequestsTotal } from "../../observability/metrics.js";
import { telemetryAcceptedResponseSchema } from "../schemas/otel.schemas.js";

function rawBodyParser(_request: FastifyRequest, body: Buffer, done: (err: Error | null, body?: Buffer) => void): void {
  done(null, body);
}

function makeHandler(signal: TelemetrySignal) {
  return async function handler(request: FastifyRequest, reply: FastifyReply) {
    ingestionRequestsTotal.add(1, { signal });

    // sourceContext is guaranteed by the source-auth preHandler.
    const context = request.sourceContext!;
    const source = context.source;

    const body = request.body as Buffer | undefined;
    if (!body || body.length === 0) {
      ingestionRejectedTotal.add(1, { reason: "empty_body", signal });
      await recordIngestionDenied({
        reason: "empty_body",
        sourceId: source.id,
        requestId: request.id,
        signal,
      });
      throw new BadRequestError("Empty telemetry body");
    }

    const decision = await resolveRouteForSource(source.id, signal);
    if (!decision.allowed) {
      ingestionRejectedTotal.add(1, { reason: decision.reason, signal });
      await recordIngestionDenied({
        reason: decision.reason,
        sourceId: source.id,
        requestId: request.id,
        signal,
      });
      throw new ForbiddenError(`Telemetry route for ${signal} is disabled`);
    }

    const rawContentType = request.headers["content-type"];
    const contentType = Array.isArray(rawContentType)
      ? (rawContentType[0] ?? OTLP_CONTENT_TYPES.json)
      : (rawContentType ?? OTLP_CONTENT_TYPES.json);

    const traceparent = request.headers[TRACEPARENT_HEADER];
    const correlationId = Array.isArray(traceparent) ? traceparent[0] : traceparent;

    try {
      await forwardToCollector({
        signal,
        collectorPath: decision.collectorPath,
        body,
        contentType,
        routing: {
          sourceId: source.id,
          sourceSlug: source.slug,
          environment: source.environment,
          requestId: request.id,
        },
      });
    } catch (error) {
      if (error instanceof CollectorUnavailableError) {
        await recordIngestionFailed({
          sourceId: source.id,
          signal,
          requestId: request.id,
          reason: error.message,
        });
      }
      throw error;
    }

    await recordIngestionAccepted({
      sourceId: source.id,
      signal,
      requestId: request.id,
      correlationId,
      keyPrefix: context.keyPrefix,
    });

    reply.code(202);
    return { status: "accepted" as const, requestId: request.id };
  };
}

/**
 * OTLP-compatible ingestion proxy. Registered with an `/otel` prefix so the
 * effective paths are `/otel/v1/{logs,traces,metrics}`. Raw-body content-type
 * parsers are added here (encapsulated) so admin JSON routes keep normal parsing.
 */
export async function otelProxyRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser(
    OTLP_CONTENT_TYPES.protobuf,
    { parseAs: "buffer", bodyLimit: MAX_TELEMETRY_BODY_BYTES },
    rawBodyParser,
  );
  app.addContentTypeParser(
    OTLP_CONTENT_TYPES.json,
    { parseAs: "buffer", bodyLimit: MAX_TELEMETRY_BODY_BYTES },
    rawBodyParser,
  );

  const options = {
    preHandler: sourceAuthPreHandler,
    schema: { response: { 202: telemetryAcceptedResponseSchema } },
  };

  app.post("/v1/logs", options, makeHandler("logs"));
  app.post("/v1/traces", options, makeHandler("traces"));
  app.post("/v1/metrics", options, makeHandler("metrics"));
}
