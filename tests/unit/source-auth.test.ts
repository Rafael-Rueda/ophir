import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CredentialWithSource,
} from "../../src/sources/source.repository.js";
import type { SourceApplication, SourceCredential } from "../../src/telemetry/telemetry-types.js";

vi.mock("../../src/sources/source.repository.js", () => ({
  getCredentialWithSourceByHash: vi.fn(),
  markCredentialUsed: vi.fn().mockResolvedValue(undefined),
}));

const { getCredentialWithSourceByHash } = await import("../../src/sources/source.repository.js");
const { authenticateSourceKey, hashSourceKey } = await import(
  "../../src/sources/source-credential.service.js"
);

const mockLookup = vi.mocked(getCredentialWithSourceByHash);

function makeSource(overrides: Partial<SourceApplication> = {}): SourceApplication {
  return {
    id: "source-1",
    slug: "demo-api",
    displayName: "Demo API",
    environment: "local",
    ownerName: null,
    ownerContact: null,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCredential(overrides: Partial<SourceCredential> = {}): SourceCredential {
  return {
    id: "cred-1",
    sourceApplicationId: "source-1",
    keyPrefix: "ophir_src_abc123",
    keyHash: "hash",
    status: "active",
    createdAt: new Date(),
    expiresAt: null,
    lastUsedAt: null,
    rotatedAt: null,
    ...overrides,
  };
}

function withSource(credential: SourceCredential, source: SourceApplication): CredentialWithSource {
  return { credential, source };
}

describe("source authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hashes keys deterministically and distinctly", () => {
    expect(hashSourceKey("abc")).toBe(hashSourceKey("abc"));
    expect(hashSourceKey("abc")).not.toBe(hashSourceKey("abd"));
  });

  it("rejects an empty key", async () => {
    expect(await authenticateSourceKey("   ")).toEqual({ ok: false, reason: "missing_key" });
  });

  it("rejects an unknown key", async () => {
    mockLookup.mockResolvedValue(null);
    expect(await authenticateSourceKey("ophir_src_unknown")).toEqual({
      ok: false,
      reason: "unknown_key",
    });
  });

  it("rejects a disabled source", async () => {
    mockLookup.mockResolvedValue(withSource(makeCredential(), makeSource({ status: "disabled" })));
    expect(await authenticateSourceKey("k")).toEqual({ ok: false, reason: "source_disabled" });
  });

  it("rejects a rotated credential", async () => {
    mockLookup.mockResolvedValue(withSource(makeCredential({ status: "rotated" }), makeSource()));
    const result = await authenticateSourceKey("k");
    expect(result.ok).toBe(false);
  });

  it("rejects an expired credential", async () => {
    mockLookup.mockResolvedValue(
      withSource(makeCredential({ expiresAt: new Date(Date.now() - 1000) }), makeSource()),
    );
    expect(await authenticateSourceKey("k")).toEqual({ ok: false, reason: "credential_expired" });
  });

  it("accepts an active credential and source", async () => {
    mockLookup.mockResolvedValue(withSource(makeCredential(), makeSource()));
    const result = await authenticateSourceKey("k");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.auth.source.id).toBe("source-1");
      expect(result.auth.keyPrefix).toBe("ophir_src_abc123");
    }
  });
});
