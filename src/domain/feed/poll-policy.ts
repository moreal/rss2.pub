import { err, ok, type Result } from "../../shared/result.js";
import type { CacheValidators, Feed } from "./feed.js";
import {
  backoffSeconds,
  jitteredSeconds,
  type RetryBudget,
} from "./retry-policy.js";

/**
 * When to poll a feed again.
 *
 * A poll that finds something new schedules the next one `intervalSeconds`
 * ahead. A poll that finds nothing stretches the wait by `ADAPTIVE_GROWTH`
 * per consecutive quiet poll, up to `maxIntervalSeconds` — a feed that has
 * not changed in a year should not be fetched as often as one posting hourly,
 * and most origins send no cache validators, so every one of those polls is a
 * full download. Any change resets the interval, so an active feed stays as
 * fresh as it ever was. Each consecutive *failure* instead doubles the wait
 * up to `maxBackoffSeconds`.
 */
export type PollPolicy = {
  readonly intervalSeconds: number;
  readonly maxIntervalSeconds: number;
  readonly maxBackoffSeconds: number;
};

export type InvalidPollPolicy = {
  readonly type: "InvalidPollPolicy";
  readonly reason:
    | "IntervalOutOfRange"
    | "MaxIntervalBelowInterval"
    | "MaxBackoffBelowInterval";
};

/** Growth factor applied per consecutive poll that found nothing new. */
export const ADAPTIVE_GROWTH = 1.5;

const DEFAULT: PollPolicy = {
  intervalSeconds: 600,
  maxIntervalSeconds: 1800,
  maxBackoffSeconds: 86_400,
};

export const PollPolicy = {
  DEFAULT,
  create(params: {
    readonly intervalSeconds: number;
    readonly maxIntervalSeconds: number;
    readonly maxBackoffSeconds: number;
  }): Result<PollPolicy, InvalidPollPolicy> {
    const { intervalSeconds, maxIntervalSeconds, maxBackoffSeconds } = params;
    if (!Number.isInteger(intervalSeconds) || intervalSeconds < 1) {
      return err({ type: "InvalidPollPolicy", reason: "IntervalOutOfRange" });
    }
    if (
      !Number.isInteger(maxIntervalSeconds) ||
      maxIntervalSeconds < intervalSeconds
    ) {
      return err({
        type: "InvalidPollPolicy",
        reason: "MaxIntervalBelowInterval",
      });
    }
    if (
      !Number.isInteger(maxBackoffSeconds) ||
      maxBackoffSeconds < maxIntervalSeconds
    ) {
      return err({
        type: "InvalidPollPolicy",
        reason: "MaxBackoffBelowInterval",
      });
    }
    return ok({ intervalSeconds, maxIntervalSeconds, maxBackoffSeconds });
  },
} as const;

/**
 * The failure half of a poll policy, as the shared backoff shape. Not a
 * `RetryPolicy`: it is a view of an already-validated `PollPolicy`, not a
 * budget of its own.
 */
export function pollRetryPolicy(policy: PollPolicy): RetryBudget {
  return {
    baseSeconds: policy.intervalSeconds,
    ceilingSeconds: policy.maxBackoffSeconds,
    // A registered feed is the whole point of the registration: back off, but
    // never abandon it. Only favicon and article fetches give up.
    maxAttempts: null,
  };
}

export function isDue(feed: Feed, now: Date): boolean {
  return feed.nextPollAt.getTime() <= now.getTime();
}

export function afterSuccessfulPoll(
  feed: Feed,
  params: {
    readonly validators: CacheValidators;
    readonly now: Date;
    readonly policy: PollPolicy;
    /** True when the poll published or updated something. */
    readonly changed: boolean;
    readonly jitterRatio: number;
  },
): Feed {
  const unchangedPolls = params.changed ? 0 : feed.unchangedPolls + 1;
  const seconds = jitteredSeconds(
    Math.min(
      params.policy.intervalSeconds * ADAPTIVE_GROWTH ** unchangedPolls,
      params.policy.maxIntervalSeconds,
    ),
    params.jitterRatio,
  );
  return {
    ...feed,
    validators: params.validators,
    consecutiveFailures: 0,
    unchangedPolls,
    nextPollAt: new Date(params.now.getTime() + seconds * 1000),
  };
}

export function afterFailedPoll(
  feed: Feed,
  params: {
    readonly now: Date;
    readonly policy: PollPolicy;
    readonly jitterRatio: number;
  },
): Feed {
  const failures = feed.consecutiveFailures + 1;
  const seconds = jitteredSeconds(
    backoffSeconds(pollRetryPolicy(params.policy), failures),
    params.jitterRatio,
  );
  return {
    ...feed,
    consecutiveFailures: failures,
    nextPollAt: new Date(params.now.getTime() + seconds * 1000),
  };
}
