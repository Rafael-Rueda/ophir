import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { closePool } from "../../src/db/client.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ logger: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await closePool();
});

describe("admin API contract", () => {
  it("returns 200 ok for liveness", async () => {
    const response = await app.inject({ method: "GET", url: "/health/live" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("denies listing sources without a token (401)", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/sources" });
    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe("unauthorized");
    expect(typeof body.requestId).toBe("string");
  });

  it("denies /v1/me without a token (401)", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/me" });
    expect(response.statusCode).toBe(401);
  });

  it("rejects a malformed login body (400)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "not-an-email" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("bad_request");
  });

  it("returns a structured 404 for unknown routes", async () => {
    const response = await app.inject({ method: "GET", url: "/does-not-exist" });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("not_found");
  });

  it("echoes the incoming x-request-id header", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health/live",
      headers: { "x-request-id": "test-correlation-id" },
    });
    expect(response.headers["x-request-id"]).toBe("test-correlation-id");
  });
});
