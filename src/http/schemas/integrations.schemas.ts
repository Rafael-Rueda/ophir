/**
 * Response schema for `GET /v1/integrations`. The endpoint has no request body
 * or parameters, so only the response shape is described here.
 */
export const integrationListResponseSchema = {
  type: "object",
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "kind", "name", "baseUrl", "status"],
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["collector", "loki", "tempo", "prometheus", "grafana"] },
          name: { type: "string" },
          baseUrl: { type: "string" },
          status: { type: "string", enum: ["healthy", "degraded", "unavailable", "unknown"] },
          lastCheckedAt: { type: "string" },
          lastError: { type: "string" },
        },
      },
    },
  },
};
