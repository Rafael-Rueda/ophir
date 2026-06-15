import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool } from "../../src/db/client.js";
import { runMigrations } from "../../src/db/migrate.js";
import {
  getIntegrations,
  runHealthChecks,
  seedDefaultIntegrations,
} from "../../src/integrations/integration-health.service.js";
import { isDatabaseReachable } from "../helpers/stack.js";

const databaseReachable = await isDatabaseReachable();

describe.skipIf(!databaseReachable)("integration health (integration)", () => {
  beforeAll(async () => {
    await runMigrations();
  });

  afterAll(async () => {
    await closePool();
  });

  it("seeds the five default integrations", async () => {
    await seedDefaultIntegrations();
    const integrations = await getIntegrations();
    const kinds = integrations.map((integration) => integration.kind).sort();
    expect(kinds).toEqual(["collector", "grafana", "loki", "prometheus", "tempo"]);
  });

  it("probes integrations and records a valid status for each", async () => {
    const probed = await runHealthChecks();
    expect(probed.length).toBe(5);
    for (const integration of probed) {
      expect(["healthy", "degraded", "unavailable"]).toContain(integration.status);
      expect(integration.lastCheckedAt).not.toBeNull();
    }
  });
});
