import type { FastifyInstance } from "fastify";
import { loginBodySchema } from "../schemas/auth.schemas.js";
import { login } from "../../auth/admin-auth.service.js";
import { adminAuthPreHandler } from "../hooks/admin-auth-hook.js";
import { toAdminApi } from "../serializers.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/login", async (request, reply) => {
    const body = loginBodySchema.parse(request.body);
    const result = await login(body.email, body.password, request.id);
    reply.code(200);
    return { accessToken: result.accessToken, admin: toAdminApi(result.admin) };
  });

  app.get("/me", { preHandler: adminAuthPreHandler }, async (request) => {
    return toAdminApi(request.adminUser!);
  });
}
