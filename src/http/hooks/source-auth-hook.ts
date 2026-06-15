import type { FastifyReply, FastifyRequest } from "fastify";
import { SOURCE_KEY_HEADER } from "../../config/runtime.js";
import { UnauthorizedError } from "../../shared/errors.js";
import { authenticateSourceKey } from "../../sources/source-credential.service.js";
import { recordIngestionDenied } from "../../audit/audit.service.js";
import { ingestionRejectedTotal } from "../../observability/metrics.js";
import type { AuthenticatedSource } from "../../telemetry/telemetry-types.js";

declare module "fastify" {
  interface FastifyRequest {
    sourceContext?: AuthenticatedSource;
  }
}

/**
 * preHandler that authenticates a source application by its ingestion key.
 * On failure, records a denied-ingestion audit event and returns 401.
 * On success, decorates `request.sourceContext`.
 */
export async function sourceAuthPreHandler(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const headerValue = request.headers[SOURCE_KEY_HEADER];
  const key = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (!key) {
    ingestionRejectedTotal.add(1, { reason: "missing_key" });
    await recordIngestionDenied({ reason: "missing_key", requestId: request.id });
    throw new UnauthorizedError("Missing source key");
  }

  const outcome = await authenticateSourceKey(key);
  if (!outcome.ok) {
    ingestionRejectedTotal.add(1, { reason: outcome.reason });
    await recordIngestionDenied({ reason: outcome.reason, requestId: request.id });
    throw new UnauthorizedError("Invalid source key");
  }

  request.sourceContext = outcome.auth;
}
