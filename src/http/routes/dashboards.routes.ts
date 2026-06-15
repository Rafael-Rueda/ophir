import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { adminAuthPreHandler } from "../hooks/admin-auth-hook.js";
import { listActiveDashboardLinks } from "../../integrations/dashboard-link.service.js";

const dashboardQuerySchema = z.object({
  sourceId: z.string().optional(),
  telemetryType: z.enum(["logs", "traces", "metrics", "overview"]).optional(),
});

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", adminAuthPreHandler);

  app.get("/dashboard-links", async (request) => {
    const filter = dashboardQuerySchema.parse(request.query);
    const items = await listActiveDashboardLinks(filter);
    return { items };
  });
}
