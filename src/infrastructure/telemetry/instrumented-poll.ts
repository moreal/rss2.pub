import {
  type Meter,
  metrics,
  SpanStatusCode,
  trace,
  type Tracer,
} from "@opentelemetry/api";
import { getLogger } from "@logtape/logtape";
import type { PollFeed } from "../../application/poll-feed.js";

const logger = getLogger(["rss2pub", "poll"]);

/**
 * Observability decorator around PollFeed — spans and metrics live here so
 * application code stays free of telemetry concerns. With OTel disabled the
 * global no-op providers make this near-zero cost.
 */
export function instrumentPollFeed(
  inner: PollFeed,
  instruments: {
    readonly meter?: Meter;
    readonly tracer?: Tracer;
  } = {},
): PollFeed {
  const tracer = instruments.tracer ?? trace.getTracer("rss2pub");
  const meter = instruments.meter ?? metrics.getMeter("rss2pub");
  const publishedItems = meter.createCounter("rss2pub.poll.published_items", {
    description: "Feed items published to followers",
  });
  const fetchFailures = meter.createCounter("rss2pub.poll.fetch_failures", {
    description: "Feed polls that failed to fetch",
  });
  const authorLookupFailures = meter.createCounter(
    "rss2pub.poll.author_lookup_failures",
    { description: "Atom author Actor lookups that failed" },
  );
  const pollDuration = meter.createHistogram("rss2pub.poll.duration", {
    description: "Duration of a single feed poll",
    unit: "ms",
  });
  return {
    execute(feedId) {
      return tracer.startActiveSpan(
        "rss2pub.poll_feed",
        { attributes: { "rss2pub.feed.id": feedId } },
        async (span) => {
          const startedAt = performance.now();
          try {
            const result = await inner.execute(feedId);
            if (result.ok) {
              span.setAttributes({
                "rss2pub.poll.status": result.value.status,
                "rss2pub.poll.published": result.value.published,
              });
              publishedItems.add(result.value.published);
              if (result.value.status === "fetch-failed") fetchFailures.add(1);
              authorLookupFailures.add(result.value.attributionErrors.length);
              for (const error of result.value.attributionErrors) {
                logger.warn("Atom author lookup failed: {error}", { error });
              }
            } else {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: result.error.type,
              });
            }
            return result;
          } catch (error) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error instanceof Error ? error.message : String(error),
            });
            throw error;
          } finally {
            pollDuration.record(performance.now() - startedAt);
            span.end();
          }
        },
      );
    },
  };
}
