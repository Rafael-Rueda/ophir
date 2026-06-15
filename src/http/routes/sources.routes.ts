import type { FastifyInstance } from "fastify";
import { adminAuthPreHandler } from "../hooks/admin-auth-hook.js";
import {
  createSourceBodySchema,
  sourceIdParamSchema,
  updateSourceBodySchema,
} from "../schemas/sources.schemas.js";
import {
  createSource,
  getSourceOrThrow,
  listAllSources,
  updateSourceById,
} from "../../sources/source.service.js";
import { createSourceCredential } from "../../sources/source-credential.service.js";
import { toSourceApi } from "../serializers.js";
import {
  AuditEventTypes,
  recordCredentialCreated,
  recordSourceChange,
} from "../../audit/audit.service.js";

export async function sourcesRoutes(app: FastifyInstance): Promise<void> {
  // Every source route requires an authenticated admin (scoped to this plugin).
  app.addHook("preHandler", adminAuthPreHandler);

  app.get("/sources", async () => {
    const sources = await listAllSources();
    return { items: sources.map(toSourceApi) };
  });

  app.post("/sources", async (request, reply) => {
    const body = createSourceBodySchema.parse(request.body);
    const source = await createSource(body);
    await recordSourceChange({
      eventType: AuditEventTypes.sourceCreated,
      adminId: request.adminUser!.id,
      sourceId: source.id,
      requestId: request.id,
      metadata: { slug: source.slug, environment: source.environment },
    });
    reply.code(201);
    return toSourceApi(source);
  });

  app.get("/sources/:sourceId", async (request) => {
    const { sourceId } = sourceIdParamSchema.parse(request.params);
    const source = await getSourceOrThrow(sourceId);
    return toSourceApi(source);
  });

  app.patch("/sources/:sourceId", async (request) => {
    const { sourceId } = sourceIdParamSchema.parse(request.params);
    const body = updateSourceBodySchema.parse(request.body);
    const source = await updateSourceById(sourceId, body);
    await recordSourceChange({
      eventType: AuditEventTypes.sourceUpdated,
      adminId: request.adminUser!.id,
      sourceId,
      requestId: request.id,
      metadata: body,
    });
    return toSourceApi(source);
  });

  app.post("/sources/:sourceId/credentials", async (request, reply) => {
    const { sourceId } = sourceIdParamSchema.parse(request.params);
    await getSourceOrThrow(sourceId);
    const credential = await createSourceCredential(sourceId);
    await recordCredentialCreated({
      adminId: request.adminUser!.id,
      sourceId,
      requestId: request.id,
      keyPrefix: credential.keyPrefix,
    });
    reply.code(201);
    return {
      credentialId: credential.credentialId,
      keyPrefix: credential.keyPrefix,
      plaintextKey: credential.plaintextKey,
    };
  });
}
