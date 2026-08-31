import { trace } from "@opentelemetry/api";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { describe, expect, it } from "vitest";
import type {
  PollFeed,
  PollFeedReport,
} from "../../../../src/application/poll-feed.js";
import { FeedId } from "../../../../src/domain/feed/feed.js";
import { instrumentPollFeed } from "../../../../src/infrastructure/telemetry/instrumented-poll.js";
import { ok } from "../../../../src/shared/result.js";
import { unwrap } from "../../../helpers/result.js";

describe("instrumentPollFeed", () => {
  it("counts author lookup failures without changing poll success", async () => {
    const feedId = unwrap(FeedId.create("0".repeat(64)));
    const report: PollFeedReport = {
      feedId,
      status: "polled",
      published: 1,
      updated: 0,
      publishErrors: [],
      attributionErrors: ["first lookup failed", "second lookup failed"],
      fetchError: null,
    };
    const inner: PollFeed = {
      async execute() {
        return ok(report);
      },
    };
    const exporter = new InMemoryMetricExporter(
      AggregationTemporality.CUMULATIVE,
    );
    const reader = new PeriodicExportingMetricReader({
      exporter,
      exportIntervalMillis: 60_000,
    });
    const provider = new MeterProvider({ readers: [reader] });

    try {
      const wrapped = instrumentPollFeed(inner, {
        meter: provider.getMeter("test"),
        tracer: trace.getTracer("test"),
      });

      expect(await wrapped.execute(feedId)).toEqual(ok(report));
      await provider.forceFlush();

      const metric = exporter.getMetrics()
        .flatMap((resource) => resource.scopeMetrics)
        .flatMap((scope) => scope.metrics)
        .find((candidate) =>
          candidate.descriptor.name === "rss2pub.poll.author_lookup_failures"
        );
      expect(metric).toMatchObject({
        dataPoints: [{ value: 2 }],
      });
    } finally {
      await provider.shutdown();
    }
  });
});
