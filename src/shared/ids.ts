import { randomBytes, randomUUID } from "node:crypto";

/** Generates a stable unique identifier for entities. */
export function newId(): string {
  return randomUUID();
}

/** Generates a URL-safe random token of the requested byte length. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Builds a plaintext source ingestion key and its short visible prefix.
 * The prefix is stored for admin identification; the full key is shown once.
 */
export function generateSourceKey(prefix: string): { plaintextKey: string; keyPrefix: string } {
  const secret = randomToken(24);
  const plaintextKey = `${prefix}${secret}`;
  // Visible prefix = configured prefix + first 6 chars of the secret.
  const keyPrefix = `${prefix}${secret.slice(0, 6)}`;
  return { plaintextKey, keyPrefix };
}
