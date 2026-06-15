import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/auth/password.service.js";
import { signAdminToken, verifyAdminToken } from "../../src/auth/jwt.service.js";

describe("password hashing", () => {
  it("verifies a correct password and rejects an incorrect one", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("produces a distinct salt per hash", async () => {
    const a = await hashPassword("same-password-123");
    const b = await hashPassword("same-password-123");
    expect(a).not.toBe(b);
  });
});

describe("admin JWT tokens", () => {
  it("signs and verifies a token round-trip", async () => {
    const token = await signAdminToken({
      sub: "admin-1",
      sid: "session-1",
      email: "admin@example.com",
      role: "admin",
    });
    const claims = await verifyAdminToken(token);
    expect(claims.sub).toBe("admin-1");
    expect(claims.sid).toBe("session-1");
    expect(claims.email).toBe("admin@example.com");
    expect(claims.role).toBe("admin");
  });

  it("rejects a malformed token", async () => {
    await expect(verifyAdminToken("not.a.valid.jwt")).rejects.toBeTruthy();
  });
});
