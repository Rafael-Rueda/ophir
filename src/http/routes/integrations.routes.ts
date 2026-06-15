import type { FastifyInstance } from "fastify";
import { adminAuthPreHandler } from "../hooks/admin-auth-hook.js";
import { getIntegrations } from "../../integrations/integration-health.service.js";
import { toIntegrationApi } from "../serializers.js";

export async function integrationsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", adminAuthPreHandler);

  app.get("/integrations", async () => {
    const integrations = await getIntegrations();
    return { items: integrations.map(toIntegrationApi) };
  });
}
