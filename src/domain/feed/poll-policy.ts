import { err, ok, type Result } from "../../shared/result.js";
import type { CacheValidators, Feed } from "./feed.js";

/**
 * When to poll a feed again. Success schedules the next poll one interval
 * ahead; each consecutive failure doubles the wait (exponential backoff)
 * up to `maxBackoffSeconds`.
 */
export type PollPolicy = {
  readonly intervalSeconds: number;
  readonly maxBackoffSeconds: number;
};

export type InvalidPollPolicy = {
  readonly type: "InvalidPollPolicy";
  readonly reason: "IntervalOutOfRange" | "MaxBackoffBelowInterval";
};

const DEFAULT: PollPolicy = { intervalSeconds: 600, maxBackoffSeconds: 86_400 };

export const PollPolicy = {
  DEFAULT,
  create(params: {
    readonly intervalSeconds: number;
    readonly maxBackoffSeconds: number;
  }): Result<PollPolicy, InvalidPollPolicy> {
    const { intervalSeconds, maxBackoffSeconds } = params;
    if (!Number.isInteger(intervalSeconds) || intervalSeconds < 1) {
      return err({ type: "InvalidPollPolicy", reason: "IntervalOutOfRange" });
    }
    if (
      !Number.isInteger(maxBackoffSeconds) ||
      maxBackoffSeconds < intervalSeconds
    ) {
      return err({
        type: "InvalidPollPolicy",
        reason: "MaxBackoffBelowInterval",
      });
    }
    return ok({ intervalSeconds, maxBackoffSeconds });
  },
} as const;

export function isDue(feed: Feed, now: Date): boolean {
  return feed.nextPollAt.getTime() <= now.getTime();
}

export function afterSuccessfulPoll(
  feed: Feed,
  params: {
    readonly validators: CacheValidators;
    readonly now: Date;
    readonly policy: PollPolicy;
  },
): Feed {
  return {
    ...feed,
    validators: params.validators,
    consecutiveFailures: 0,
    nextPollAt: new Date(
      params.now.getTime() + params.policy.intervalSeconds * 1000,
    ),
  };
}

export function afterFailedPoll(
  feed: Feed,
  params: { readonly now: Date; readonly policy: PollPolicy },
): Feed {
  const failures = feed.consecutiveFailures + 1;
  const backoffSeconds = Math.min(
    params.policy.intervalSeconds * 2 ** failures,
    params.policy.maxBackoffSeconds,
  );
  return {
    ...feed,
    consecutiveFailures: failures,
    nextPollAt: new Date(params.now.getTime() + backoffSeconds * 1000),
  };
}
