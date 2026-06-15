import { describe, expect, it } from "vitest";
import { isSensitiveKey, redactObject } from "../../src/telemetry/redaction-policy.service.js";

describe("redaction policy", () => {
  it("flags known sensitive keys case-insensitively and composite", () => {
    expect(isSensitiveKey("authorization")).toBe(true);
    expect(isSensitiveKey("Authorization")).toBe(true);
    expect(isSensitiveKey("set-cookie")).toBe(true);
    expect(isSensitiveKey("x-api-key")).toBe(true);
    expect(isSensitiveKey("user_password")).toBe(true);
    expect(isSensitiveKey("credit_card")).toBe(true);
  });

  it("allows low-cardinality, non-sensitive keys", () => {
    expect(isSensitiveKey("service.name")).toBe(false);
    expect(isSensitiveKey("http.method")).toBe(false);
    expect(isSensitiveKey("email")).toBe(false);
  });

  it("recursively redacts sensitive values while preserving others", () => {
    const input = {
      user: { email: "a@b.c", password: "secret" },
      headers: { authorization: "Bearer x", traceparent: "00-abc" },
      count: 3,
    };
    const output = redactObject(input);
    expect(output.user.password).toBe("[REDACTED]");
    expect(output.headers.authorization).toBe("[REDACTED]");
    expect(output.user.email).toBe("a@b.c");
    expect(output.headers.traceparent).toBe("00-abc");
    expect(output.count).toBe(3);
    // Original object is not mutated.
    expect(input.user.password).toBe("secret");
  });
});
