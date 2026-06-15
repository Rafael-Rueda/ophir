import { getEnv } from "../../src/config/env.js";
import { pingDatabase } from "../../src/db/client.js";

/** True when the control-plane PostgreSQL database is reachable. */
export async function isDatabaseReachable(): Promise<boolean> {
  return pingDatabase(1500);
}

/** True when the OpenTelemetry Collector health endpoint responds. */
export async function isCollectorReachable(): Promise<boolean> {
  const url = `${getEnv().COLLECTOR_URL.replace(/\/+$/, "")}/`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
