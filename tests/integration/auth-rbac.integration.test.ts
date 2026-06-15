import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { closePool } from "../../src/db/client.js";
import { runMigrations } from "../../src/db/migrate.js";
import { createAdmin } from "../../src/auth/admin-auth.service.js";
import { isDatabaseReachable } from "../helpers/stack.js";

const databaseReachable = await isDatabaseReachable();

describe.skipIf(!databaseReachable)("auth and RBAC (integration)", () => {
  let app: FastifyInstance;
  const email = `admin-${Date.now()}@example.com`;
  const password = "local-development-password";

  beforeAll(async () => {
    await runMigrations();
    await createAdmin({ email, displayName: "Integration Admin", password });
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await closePool();
  });

  it("logs in and resolves the current admin via /v1/me", async () => {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email, password },
    });
    expect(loginResponse.statusCode).toBe(200);
    const token = loginResponse.json().accessToken as string;
    expect(typeof token).toBe("string");

    const meResponse = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(meResponse.statusCode).toBe(200);
    expect(meResponse.json().email).toBe(email.toLowerCase());
  });

  it("denies admin routes without a token", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/sources" });
    expect(response.statusCode).toBe(401);
  });

  it("denies login with an incorrect password", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email, password: "incorrect-password-value" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("creates a source and a credential through the admin API", async () => {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email, password },
    });
    const token = loginResponse.json().accessToken as string;
    const authHeader = { authorization: `Bearer ${token}` };

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/sources",
      headers: authHeader,
      payload: {
        slug: `rbac-${Date.now()}`,
        displayName: "RBAC Test Source",
        environment: "local",
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const sourceId = createResponse.json().id as string;

    const credentialResponse = await app.inject({
      method: "POST",
      url: `/v1/sources/${sourceId}/credentials`,
      headers: authHeader,
    });
    expect(credentialResponse.statusCode).toBe(201);
    const credential = credentialResponse.json();
    expect(typeof credential.plaintextKey).toBe("string");
    expect(credential.plaintextKey.startsWith("ophir_src_")).toBe(true);
  });
});
