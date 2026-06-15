/**
 * JSON schemas for the OTLP ingestion proxy responses. The request bodies are
 * forwarded verbatim, so only response shapes are described here.
 */

export const telemetryAcceptedResponseSchema = {
  type: "object",
  required: ["status", "requestId"],
  properties: {
    status: { type: "string", enum: ["accepted"] },
    requestId: { type: "string" },
  },
};

export const errorResponseSchema = {
  type: "object",
  required: ["error", "requestId"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
      },
    },
    requestId: { type: "string" },
  },
};
