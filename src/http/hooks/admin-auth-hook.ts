import type { FastifyReply, FastifyRequest } from "fastify";
import { UnauthorizedError } from "../../shared/errors.js";
import { getActiveAdminFromToken, type AdminUser } from "../../auth/admin-auth.service.js";
import { recordAdminViewDenied } from "../../audit/audit.service.js";

declare module "fastify" {
  interface FastifyRequest {
    adminUser?: AdminUser;
  }
}

const BEARER_PREFIX = "Bearer ";

/**
 * preHandler enforcing admin authentication (RBAC). Denied attempts (missing or
 * invalid token) produce an `admin.view.denied` audit event and return 401.
 */
export async function adminAuthPreHandler(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const header = request.headers["authorization"];
  const value = Array.isArray(header) ? header[0] : header;

  if (!value || !value.startsWith(BEARER_PREFIX)) {
    await recordAdminViewDenied({
      requestId: request.id,
      reason: "missing_bearer",
      route: request.url,
    });
    throw new UnauthorizedError("Missing bearer token");
  }

  const token = value.slice(BEARER_PREFIX.length).trim();

  try {
    request.adminUser = await getActiveAdminFromToken(token);
  } catch {
    await recordAdminViewDenied({
      requestId: request.id,
      reason: "invalid_token",
      route: request.url,
    });
    throw new UnauthorizedError("Invalid or expired token");
  }
}
