import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { closePool } from "../../src/db/client.js";
import { isDatabaseReachable } from "../helpers/stack.js";

const databaseReachable = await isDatabaseReachable();

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ logger: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await closePool();
});

describe("OTLP ingestion proxy contract", () => {
  it("rejects ingestion without a source key (401)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/otel/v1/logs",
      headers: { "content-type": "application/json" },
      payload: Buffer.from("{}"),
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("unauthorized");
  });

  it("rejects an unsupported content type (415)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/otel/v1/traces",
      headers: { "content-type": "application/xml" },
      payload: "<telemetry/>",
    });
    expect(response.statusCode).toBe(415);
  });

  describe.skipIf(!databaseReachable)("with database", () => {
    it("rejects an unknown source key (401)", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/otel/v1/metrics",
        headers: { "content-type": "application/json", "x-ophir-source-key": "ophir_src_unknown" },
        payload: Buffer.from("{}"),
      });
      expect(response.statusCode).toBe(401);
    });
  });
});
