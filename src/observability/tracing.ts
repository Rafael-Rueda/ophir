import { trace, SpanStatusCode, type Attributes, type Span } from "@opentelemetry/api";
import { SERVICE_NAME } from "../config/runtime.js";

const tracer = trace.getTracer(SERVICE_NAME);

/**
 * Runs `fn` inside an active span. On error, records the exception and marks the
 * span as failed. Works as a no-op when no SDK is registered (e.g. in tests).
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T> | T,
  attributes?: Attributes,
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    try {
      if (attributes) span.setAttributes(attributes);
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : "unknown error",
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
