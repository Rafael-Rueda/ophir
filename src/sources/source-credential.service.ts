import { createHash } from "node:crypto";
import { getEnv } from "../config/env.js";
import { generateSourceKey } from "../shared/ids.js";
import { isExpired } from "../shared/time.js";
import {
  getCredentialWithSourceByHash,
  insertCredential,
  markCredentialUsed,
} from "./source.repository.js";
import type { AuthenticatedSource } from "../telemetry/telemetry-types.js";

/**
 * Hashes a source key with SHA-256. Source keys are high-entropy random tokens,
 * so a fast deterministic hash is appropriate and enables indexed lookups
 * (unlike a salted password hash, which cannot be looked up by value).
 */
export function hashSourceKey(plaintextKey: string): string {
  return createHash("sha256").update(plaintextKey, "utf8").digest("hex");
}

export interface CreatedCredential {
  credentialId: string;
  keyPrefix: string;
  plaintextKey: string;
}

/** Creates a new ingestion credential and returns the plaintext key once. */
export async function createSourceCredential(
  sourceId: string,
  expiresAt?: Date | null,
): Promise<CreatedCredential> {
  const env = getEnv();
  const { plaintextKey, keyPrefix } = generateSourceKey(env.SOURCE_KEY_PREFIX);
  const keyHash = hashSourceKey(plaintextKey);
  const credential = await insertCredential({
    sourceApplicationId: sourceId,
    keyPrefix,
    keyHash,
    expiresAt: expiresAt ?? null,
  });
  return { credentialId: credential.id, keyPrefix, plaintextKey };
}

export type SourceAuthOutcome =
  | { ok: true; auth: AuthenticatedSource }
  | { ok: false; reason: string };

/**
 * Authenticates a plaintext source key. Returns a structured outcome (never
 * throws) so callers can produce precise audit reasons.
 */
export async function authenticateSourceKey(plaintextKey: string): Promise<SourceAuthOutcome> {
  const trimmed = plaintextKey.trim();
  if (!trimmed) return { ok: false, reason: "missing_key" };

  const keyHash = hashSourceKey(trimmed);
  const found = await getCredentialWithSourceByHash(keyHash);
  if (!found) return { ok: false, reason: "unknown_key" };

  const { credential, source } = found;
  if (credential.status !== "active") return { ok: false, reason: `credential_${credential.status}` };
  if (isExpired(credential.expiresAt)) return { ok: false, reason: "credential_expired" };
  if (source.status !== "active") return { ok: false, reason: "source_disabled" };

  // Best-effort usage timestamp; must not block or fail authentication.
  void markCredentialUsed(credential.id).catch(() => undefined);

  return {
    ok: true,
    auth: { source, credentialId: credential.id, keyPrefix: credential.keyPrefix },
  };
}
