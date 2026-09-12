import type { Brand } from "../../shared/brand.js";
import { err, ok, type Result } from "../../shared/result.js";

/**
 * When to try a failed outbound fetch again, and when to stop trying.
 */
export type RetryBudget = {
  readonly baseSeconds: number;
  readonly ceilingSeconds: number;
  /** Attempts after which the target is abandoned; null never gives up. */
  readonly maxAttempts: number | null;
};

/**
 * A budget that passed `RetryPolicy.create`. Branded so holding one proves the
 * base/ceiling/attempt invariants hold — a bare literal will not typecheck.
 */
export type RetryPolicy = Brand<RetryBudget, "RetryPolicy">;

/**
 * How far a target is through its retry budget. `nextAttemptAt` is null while
 * the target has never been attempted, which reads as "due now".
 */
export type RetryState = {
  readonly failures: number;
  readonly nextAttemptAt: Date | null;
};

export type InvalidRetryPolicy = {
  readonly type: "InvalidRetryPolicy";
  readonly reason: "BaseOutOfRange" | "CeilingBelowBase" | "MaxAttemptsOutOfRange";
};

/**
 * Fraction by which a scheduled wait is spread, symmetrically. Feeds
 * registered in the same scheduler tick would otherwise stay phase-locked
 * forever, since each poll re-anchors on its own completion time — they would
 * hit the same origin together on every cycle. The spread is symmetric, so
 * the mean cadence is unchanged.
 */
export const JITTER_SPREAD = 0.1;

/** Spreads `seconds` by ±JITTER_SPREAD, given a uniform ratio in [0, 1). */
export function jitteredSeconds(seconds: number, ratio: number): number {
  return seconds * (1 + (ratio * 2 - 1) * JITTER_SPREAD);
}

export const RetryPolicy = {
  create(params: {
    readonly baseSeconds: number;
    readonly ceilingSeconds: number;
    readonly maxAttempts: number | null;
  }): Result<RetryPolicy, InvalidRetryPolicy> {
    const { baseSeconds, ceilingSeconds, maxAttempts } = params;
    if (!Number.isInteger(baseSeconds) || baseSeconds < 1) {
      return err({ type: "InvalidRetryPolicy", reason: "BaseOutOfRange" });
    }
    if (!Number.isInteger(ceilingSeconds) || ceilingSeconds < baseSeconds) {
      return err({ type: "InvalidRetryPolicy", reason: "CeilingBelowBase" });
    }
    if (
      maxAttempts !== null &&
      (!Number.isInteger(maxAttempts) || maxAttempts < 1)
    ) {
      return err({ type: "InvalidRetryPolicy", reason: "MaxAttemptsOutOfRange" });
    }
    return ok({ baseSeconds, ceilingSeconds, maxAttempts } as RetryPolicy);
  },
} as const;

/**
 * For the fixed policies below: their arguments are literals in this file, so
 * an invalid one is a programmer error, not a runtime outcome.
 */
function fixedPolicy(params: RetryBudget): RetryPolicy {
  const result = RetryPolicy.create(params);
  if (!result.ok) {
    throw new Error(`invalid retry policy: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

/** Wait after `failures` consecutive failures, doubling from the first one. */
export function backoffSeconds(policy: RetryBudget, failures: number): number {
  return Math.min(policy.baseSeconds * 2 ** failures, policy.ceilingSeconds);
}

export function isRetryDue(state: RetryState, now: Date): boolean {
  return (
    state.nextAttemptAt === null || state.nextAttemptAt.getTime() <= now.getTime()
  );
}

export function hasGivenUp(policy: RetryPolicy, state: RetryState): boolean {
  return policy.maxAttempts !== null && state.failures >= policy.maxAttempts;
}

/**
 * Favicon resolution (ADR-0010). A site that serves no usable icon should be
 * asked a handful of times over a day or so and then left alone — the avatar
 * is cosmetic, and the alternative (the previous behaviour) was one wasted
 * request on every poll, forever.
 */
export const ICON_RETRY_DEFAULT = fixedPolicy({
  baseSeconds: 3600,
  ceilingSeconds: 86_400,
  maxAttempts: 5,
});

export function afterFailure(
  policy: RetryPolicy,
  state: RetryState,
  params: { readonly now: Date; readonly jitterRatio: number },
): RetryState {
  const failures = state.failures + 1;
  const seconds = jitteredSeconds(
    backoffSeconds(policy, failures),
    params.jitterRatio,
  );
  return {
    failures,
    nextAttemptAt: new Date(params.now.getTime() + seconds * 1000),
  };
}
