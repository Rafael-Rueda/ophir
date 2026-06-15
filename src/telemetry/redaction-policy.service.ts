import { query } from "../db/client.js";

/**
 * Known sensitive attribute keys. Primary redaction happens in the Collector
 * pipeline; Ophir owns the policy and uses it to sanitize anything it stores
 * itself (such as audit metadata).
 */
export const DEFAULT_SENSITIVE_KEYS = [
  "authorization",
  "cookie",
  "set-cookie",
  "password",
  "secret",
  "token",
  "api_key",
  "apikey",
  "credit_card",
] as const;

const REDACTED = "[REDACTED]";
const MAX_REDACTION_DEPTH = 6;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]+/g, "");
}

const normalizedSensitive = new Set(DEFAULT_SENSITIVE_KEYS.map(normalizeKey));

/** Returns true when a key matches the sensitive-key policy. */
export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (normalizedSensitive.has(normalized)) return true;
  // Catch composite keys like "x-api-key" or "user_password".
  for (const sensitive of normalizedSensitive) {
    if (normalized.includes(sensitive)) return true;
  }
  return false;
}

/**
 * Returns a deep copy of `value` with sensitive keys replaced by `[REDACTED]`.
 * Safe for arbitrary nested objects/arrays; cycles are bounded by depth.
 */
export function redactObject<T>(value: T, depth = 0): T {
  if (depth > MAX_REDACTION_DEPTH || value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactObject(item, depth + 1)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    result[key] = isSensitiveKey(key) ? REDACTED : redactObject(val, depth + 1);
  }
  return result as T;
}

export interface RedactionRule {
  id: string;
  name: string;
  matchPath: string;
  action: "drop" | "mask" | "hash";
  enabled: boolean;
}

type RedactionRow = {
  id: string;
  name: string;
  match_path: string;
  action: "drop" | "mask" | "hash";
  enabled: boolean;
};

/** Loads enabled redaction rules from the database. */
export async function loadEnabledRedactionRules(): Promise<RedactionRule[]> {
  const { rows } = await query<RedactionRow>(
    `SELECT id, name, match_path, action, enabled FROM redaction_rules WHERE enabled = true ORDER BY name`,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    matchPath: row.match_path,
    action: row.action,
    enabled: row.enabled,
  }));
}
