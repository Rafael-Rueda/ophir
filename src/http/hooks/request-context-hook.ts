import type { FastifyInstance } from "fastify";
import { REQUEST_ID_HEADER } from "../../config/runtime.js";

/**
 * Registers a global hook that echoes the request id back to the caller via the
 * `x-request-id` response header. The id itself is produced by Fastify's
 * `genReqId` (which prefers an inbound `x-request-id`).
 */
export function registerRequestContext(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    reply.header(REQUEST_ID_HEADER, request.id);
  });
}
