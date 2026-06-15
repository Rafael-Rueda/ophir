import { getEnv } from "../config/env.js";
import { COLLECTOR_SIGNAL_PATHS, FORWARD_HEADERS, type TelemetrySignal } from "../config/runtime.js";
import { CollectorUnavailableError } from "../shared/errors.js";
import {
  collectorForwardDuration,
  collectorForwardFailuresTotal,
  recordDurationSeconds,
} from "../observability/metrics.js";
import { withSpan } from "../observability/tracing.js";
import type { ForwardResult } from "./telemetry-types.js";

export interface ForwardInput {
  signal: TelemetrySignal;
  collectorPath?: string;
  body: Buffer;
  contentType: string;
  routing: {
    sourceId: string;
    sourceSlug: string;
    environment: string;
    requestId: string;
  };
}

/**
 * Forwards an accepted telemetry batch to the OpenTelemetry Collector verbatim,
 * attaching Ophir routing headers. Throws `CollectorUnavailableError` (502) on
 * any non-2xx response, timeout, or network failure.
 */
export async function forwardToCollector(input: ForwardInput): Promise<ForwardResult> {
  const env = getEnv();
  const base = env.COLLECTOR_OTLP_HTTP_URL.replace(/\/+$/, "");
  const path = input.collectorPath ?? COLLECTOR_SIGNAL_PATHS[input.signal];
  const url = `${base}${path}`;

  return withSpan(
    "ophir.collector.forward",
    async (span) => {
      span.setAttributes({ "ophir.signal": input.signal, "http.url": url });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), env.COLLECTOR_FORWARD_TIMEOUT_MS);
      const startedAt = Date.now();

      try {
        const response = await fetch(url, {
          method: "POST",
          body: input.body,
          headers: {
            "content-type": input.contentType,
            [FORWARD_HEADERS.sourceId]: input.routing.sourceId,
            [FORWARD_HEADERS.sourceSlug]: input.routing.sourceSlug,
            [FORWARD_HEADERS.environment]: input.routing.environment,
            [FORWARD_HEADERS.requestId]: input.routing.requestId,
          },
          signal: controller.signal,
        });

        recordDurationSeconds(collectorForwardDuration, startedAt, { signal: input.signal });

        if (!response.ok) {
          collectorForwardFailuresTotal.add(1, { signal: input.signal });
          throw new CollectorUnavailableError(
            `Collector responded with status ${response.status}`,
          );
        }

        return { ok: true, status: response.status, durationMs: Date.now() - startedAt };
      } catch (error) {
        if (error instanceof CollectorUnavailableError) throw error;
        collectorForwardFailuresTotal.add(1, { signal: input.signal });
        const reason =
          error instanceof Error && error.name === "AbortError"
            ? "request timed out"
            : error instanceof Error
              ? error.message
              : "unknown error";
        throw new CollectorUnavailableError(`Failed to reach Collector: ${reason}`);
      } finally {
        clearTimeout(timer);
      }
    },
    { "ophir.signal": input.signal },
  );
}
