import { getLogger } from "@logtape/logtape";
import type { PollDueFeeds } from "../../application/poll-feed.js";

const logger = getLogger(["rss2pub", "scheduler"]);

export type PollScheduler = {
  start(): void;
  stop(): void;
  /** Runs one poll pass immediately; overlapping calls are coalesced. */
  tick(): Promise<void>;
};

/**
 * Drives PollDueFeeds on a fixed cadence. Per-feed pacing (interval, backoff)
 * lives in the domain's PollPolicy — this only wakes the use case up.
 */
export function createPollScheduler(deps: {
  readonly pollDueFeeds: PollDueFeeds;
  readonly tickIntervalMs: number;
}): PollScheduler {
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const reports = await deps.pollDueFeeds.execute();
      if (reports.length > 0) {
        logger.info("poll pass finished: {polled} feed(s), {published} item(s)", {
          polled: reports.length,
          published: reports.reduce((sum, r) => sum + r.published, 0),
          failures: reports.filter((r) => r.status === "fetch-failed").length,
        });
      }
    } catch (error) {
      logger.error("poll pass crashed: {error}", { error });
    } finally {
      running = false;
    }
  }

  return {
    tick,
    start() {
      if (timer !== null) return;
      timer = setInterval(() => void tick(), deps.tickIntervalMs);
      timer.unref();
      void tick();
    },
    stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
