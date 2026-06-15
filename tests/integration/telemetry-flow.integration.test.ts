import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { closePool } from "../../src/db/client.js";
import { runMigrations } from "../../src/db/migrate.js";
import { createSource } from "../../src/sources/source.service.js";
import { createSourceCredential } from "../../src/sources/source-credential.service.js";
import { countAuditEvents } from "../../src/audit/audit.repository.js";
import { isCollectorReachable, isDatabaseReachable } from "../helpers/stack.js";

const databaseReachable = await isDatabaseReachable();
const collectorReachable = databaseReachable ? await isCollectorReachable() : false;

// This end-to-end flow requires the full local stack (DB + Collector) to be up.
describe.skipIf(!(databaseReachable && collectorReachable))("telemetry flow (integration)", () => {
  let app: FastifyInstance;
  let sourceKey: string;

  beforeAll(async () => {
    await runMigrations();
    app = await buildApp({ logger: false });
    await app.ready();

    const source = await createSource({
      slug: `flow-${Date.now()}`,
      displayName: "Flow Test Source",
      environment: "local",
    });
    const credential = await createSourceCredential(source.id);
    sourceKey = credential.plaintextKey;
  });

  afterAll(async () => {
    await app?.close();
    await closePool();
  });

  it("accepts logs with a valid key, forwards them, and audits acceptance", async () => {
    const before = await countAuditEvents("telemetry.ingestion.accepted");

    const response = await app.inject({
      method: "POST",
      url: "/otel/v1/logs",
      headers: { "content-type": "application/json", "x-ophir-source-key": sourceKey },
      payload: Buffer.from(JSON.stringify({ resourceLogs: [] })),
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().status).toBe("accepted");

    const after = await countAuditEvents("telemetry.ingestion.accepted");
    expect(after).toBeGreaterThan(before);
  });

  it("accepts traces and metrics with a valid key", async () => {
    for (const signal of ["traces", "metrics"] as const) {
      const body = signal === "traces" ? { resourceSpans: [] } : { resourceMetrics: [] };
      const response = await app.inject({
        method: "POST",
        url: `/otel/v1/${signal}`,
        headers: { "content-type": "application/json", "x-ophir-source-key": sourceKey },
        payload: Buffer.from(JSON.stringify(body)),
      });
      expect(response.statusCode).toBe(202);
    }
  });
});
