import { COLLECTOR_SIGNAL_PATHS, type TelemetrySignal } from "../config/runtime.js";
import { getRoutesBySource } from "../sources/source.repository.js";
import type { TelemetryRoute } from "./telemetry-types.js";

export type RoutingDecision =
  | { allowed: true; collectorPath: string }
  | { allowed: false; reason: string };

/**
 * Pure routing policy. Given a source's routes and a signal:
 * - disabled route  -> reject (default policy)
 * - missing route   -> allow with the standard collector path (active sources
 *   are seeded with routes, so this is a permissive fallback)
 * - enabled route   -> allow with the route's configured path
 */
export function evaluateRouting(
  routes: TelemetryRoute[],
  signal: TelemetrySignal,
): RoutingDecision {
  const route = routes.find((candidate) => candidate.telemetryType === signal);
  if (!route) {
    return { allowed: true, collectorPath: COLLECTOR_SIGNAL_PATHS[signal] };
  }
  if (!route.enabled) {
    return { allowed: false, reason: "route_disabled" };
  }
  return {
    allowed: true,
    collectorPath: route.collectorEndpointPath || COLLECTOR_SIGNAL_PATHS[signal],
  };
}

/** Loads a source's routes and evaluates the routing policy for a signal. */
export async function resolveRouteForSource(
  sourceId: string,
  signal: TelemetrySignal,
): Promise<RoutingDecision> {
  const routes = await getRoutesBySource(sourceId);
  return evaluateRouting(routes, signal);
}
