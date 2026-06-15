import { describe, expect, it } from "vitest";
import { evaluateRouting } from "../../src/telemetry/routing-policy.service.js";
import type { TelemetryRoute } from "../../src/telemetry/telemetry-types.js";

function makeRoute(partial: Partial<TelemetryRoute>): TelemetryRoute {
  return {
    id: "route-1",
    sourceApplicationId: "source-1",
    telemetryType: "logs",
    collectorEndpointPath: "/v1/logs",
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe("routing policy", () => {
  it("allows an enabled route with its configured path", () => {
    const routes = [makeRoute({ telemetryType: "logs", collectorEndpointPath: "/v1/logs" })];
    expect(evaluateRouting(routes, "logs")).toEqual({ allowed: true, collectorPath: "/v1/logs" });
  });

  it("rejects a disabled route", () => {
    const routes = [makeRoute({ telemetryType: "metrics", enabled: false })];
    expect(evaluateRouting(routes, "metrics")).toEqual({ allowed: false, reason: "route_disabled" });
  });

  it("falls back to the standard path when no route exists", () => {
    expect(evaluateRouting([], "traces")).toEqual({ allowed: true, collectorPath: "/v1/traces" });
  });
});
