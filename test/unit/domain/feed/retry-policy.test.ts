import { describe, expect, it } from "vitest";
import {
  afterFailure,
  hasGivenUp,
  isRetryDue,
  jitteredSeconds,
  JITTER_SPREAD,
  RetryPolicy,
} from "../../../../src/domain/feed/retry-policy.js";
import { T0 } from "../../../helpers/fakes.js";
import { unwrap, unwrapErr } from "../../../helpers/result.js";

const policy = unwrap(
  RetryPolicy.create({ baseSeconds: 100, ceilingSeconds: 400, maxAttempts: 3 }),
);
const forever = unwrap(
  RetryPolicy.create({
    baseSeconds: 100,
    ceilingSeconds: 400,
    maxAttempts: null,
  }),
);

describe("RetryPolicy.create", () => {
  it("rejects a non-positive or fractional base", () => {
    for (const baseSeconds of [0, -1, 1.5]) {
      expect(
        unwrapErr(
          RetryPolicy.create({ baseSeconds, ceilingSeconds: 400, maxAttempts: 3 }),
        ),
      ).toMatchObject({ reason: "BaseOutOfRange" });
    }
  });

  it("rejects a ceiling below the base", () => {
    expect(
      unwrapErr(
        RetryPolicy.create({
          baseSeconds: 100,
          ceilingSeconds: 99,
          maxAttempts: 3,
        }),
      ),
    ).toMatchObject({ reason: "CeilingBelowBase" });
  });

  it("rejects a non-positive max attempts, but accepts null for 'never give up'", () => {
    expect(
      unwrapErr(
        RetryPolicy.create({
          baseSeconds: 100,
          ceilingSeconds: 400,
          maxAttempts: 0,
        }),
      ),
    ).toMatchObject({ reason: "MaxAttemptsOutOfRange" });
    expect(forever.maxAttempts).toBeNull();
  });
});

describe("jitteredSeconds", () => {
  // Jitter exists to stop feeds registered in the same tick from staying
  // phase-locked forever; the spread is symmetric so the mean cadence is
  // unchanged.
  it("maps the [0,1) ratio onto a symmetric spread around the input", () => {
    expect(jitteredSeconds(600, 0)).toBe(600 * (1 - JITTER_SPREAD));
    expect(jitteredSeconds(600, 0.5)).toBe(600);
    expect(jitteredSeconds(600, 1)).toBe(600 * (1 + JITTER_SPREAD));
  });

  it("never returns a non-positive delay", () => {
    expect(jitteredSeconds(1, 0)).toBeGreaterThan(0);
  });
});

describe("isRetryDue", () => {
  it("treats a never-attempted target as due", () => {
    expect(isRetryDue({ failures: 0, nextAttemptAt: null }, T0)).toBe(true);
  });

  it("compares nextAttemptAt against now", () => {
    const at = new Date(T0.getTime() + 1000);
    expect(isRetryDue({ failures: 1, nextAttemptAt: at }, T0)).toBe(false);
    expect(isRetryDue({ failures: 1, nextAttemptAt: at }, at)).toBe(true);
  });
});

describe("hasGivenUp", () => {
  it("gives up once failures reach maxAttempts", () => {
    expect(hasGivenUp(policy, { failures: 2, nextAttemptAt: null })).toBe(false);
    expect(hasGivenUp(policy, { failures: 3, nextAttemptAt: null })).toBe(true);
    expect(hasGivenUp(policy, { failures: 4, nextAttemptAt: null })).toBe(true);
  });

  it("never gives up when maxAttempts is null", () => {
    expect(hasGivenUp(forever, { failures: 99, nextAttemptAt: null })).toBe(false);
  });
});

describe("afterFailure", () => {
  // Doubling starts at the first failure — one failure waits 2x the base,
  // matching the feed-poll backoff this policy generalizes.
  it("doubles the wait per consecutive failure and caps at the ceiling", () => {
    const first = afterFailure(policy, { failures: 0, nextAttemptAt: null }, {
      now: T0,
      jitterRatio: 0.5,
    });
    expect(first.failures).toBe(1);
    expect(first.nextAttemptAt).toEqual(new Date(T0.getTime() + 200_000));

    const second = afterFailure(policy, first, { now: T0, jitterRatio: 0.5 });
    expect(second.failures).toBe(2);
    expect(second.nextAttemptAt).toEqual(new Date(T0.getTime() + 400_000));

    const third = afterFailure(policy, second, { now: T0, jitterRatio: 0.5 });
    expect(third.nextAttemptAt).toEqual(new Date(T0.getTime() + 400_000));
  });

  it("applies jitter to the scheduled retry", () => {
    const jittered = afterFailure(policy, { failures: 0, nextAttemptAt: null }, {
      now: T0,
      jitterRatio: 0,
    });
    expect(jittered.nextAttemptAt).toEqual(
      new Date(T0.getTime() + 200_000 * (1 - JITTER_SPREAD)),
    );
  });
});
