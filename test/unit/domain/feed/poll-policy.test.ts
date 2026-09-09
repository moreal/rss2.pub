import { describe, expect, it } from "vitest";
import {
  ADAPTIVE_GROWTH,
  afterFailedPoll,
  afterSuccessfulPoll,
  isDue,
  PollPolicy,
  pollRetryPolicy,
} from "../../../../src/domain/feed/poll-policy.js";
import { JITTER_SPREAD } from "../../../../src/domain/feed/retry-policy.js";
import { makeFeed, T0 } from "../../../helpers/fakes.js";
import { unwrap, unwrapErr } from "../../../helpers/result.js";

// The fixture is registered at T0, so scheduling assertions measure from it.
const now = T0;
const feed = makeFeed();
const validators = {
  etag: 'W/"abc"',
  lastModified: "Sat, 26 Jul 2026 11:00:00 GMT",
};
/** Ratio 0.5 is the midpoint of the jitter spread, i.e. no adjustment. */
const NO_JITTER = 0.5;

describe("PollPolicy.create", () => {
  it("rejects non-positive or fractional intervals", () => {
    for (const intervalSeconds of [0, 1.5]) {
      expect(
        unwrapErr(
          PollPolicy.create({
            intervalSeconds,
            maxIntervalSeconds: 10,
            maxBackoffSeconds: 10,
          }),
        ),
      ).toMatchObject({ reason: "IntervalOutOfRange" });
    }
  });

  it("rejects an adaptive ceiling below the base interval", () => {
    expect(
      unwrapErr(
        PollPolicy.create({
          intervalSeconds: 100,
          maxIntervalSeconds: 99,
          maxBackoffSeconds: 1000,
        }),
      ),
    ).toMatchObject({ reason: "MaxIntervalBelowInterval" });
  });

  it("rejects a max backoff below the adaptive ceiling", () => {
    expect(
      unwrapErr(
        PollPolicy.create({
          intervalSeconds: 100,
          maxIntervalSeconds: 200,
          maxBackoffSeconds: 199,
        }),
      ),
    ).toMatchObject({ reason: "MaxBackoffBelowInterval" });
  });

  it("accepts a sane policy", () => {
    expect(
      unwrap(
        PollPolicy.create({
          intervalSeconds: 600,
          maxIntervalSeconds: 1800,
          maxBackoffSeconds: 86_400,
        }),
      ),
    ).toEqual({
      intervalSeconds: 600,
      maxIntervalSeconds: 1800,
      maxBackoffSeconds: 86_400,
    });
  });
});

describe("isDue", () => {
  it("treats nextPollAt <= now as due", () => {
    expect(isDue(feed, now)).toBe(true);
    expect(isDue(feed, new Date(now.getTime() - 1))).toBe(false);
    expect(isDue(feed, new Date(now.getTime() + 1))).toBe(true);
  });
});

describe("pollRetryPolicy", () => {
  it("never gives up on a registered feed", () => {
    expect(pollRetryPolicy(PollPolicy.DEFAULT).maxAttempts).toBeNull();
  });
});

describe("afterSuccessfulPoll", () => {
  const poll = (feedIn: typeof feed, changed: boolean, jitterRatio = NO_JITTER) =>
    afterSuccessfulPoll(feedIn, {
      validators,
      now,
      policy: PollPolicy.DEFAULT,
      changed,
      jitterRatio,
    });

  it("stores validators, resets failures, schedules one interval ahead", () => {
    const failing = afterFailedPoll(feed, {
      now,
      policy: PollPolicy.DEFAULT,
      jitterRatio: NO_JITTER,
    });
    const polled = poll(failing, true);
    expect(polled.validators).toEqual(validators);
    expect(polled.consecutiveFailures).toBe(0);
    expect(polled.nextPollAt).toEqual(new Date(now.getTime() + 600_000));
  });

  it("stretches the interval while nothing changes, capped at maxIntervalSeconds", () => {
    const first = poll(feed, false);
    expect(first.unchangedPolls).toBe(1);
    expect(first.nextPollAt).toEqual(
      new Date(now.getTime() + 600_000 * ADAPTIVE_GROWTH),
    );

    const second = poll(first, false);
    expect(second.unchangedPolls).toBe(2);
    expect(second.nextPollAt).toEqual(
      new Date(now.getTime() + 600_000 * ADAPTIVE_GROWTH ** 2),
    );

    // 600 * 1.5^3 = 2025s, past the 1800s ceiling.
    const third = poll(second, false);
    expect(third.nextPollAt).toEqual(new Date(now.getTime() + 1_800_000));
  });

  it("snaps back to the base interval as soon as something changes", () => {
    const quiet = poll(poll(poll(feed, false), false), false);
    const active = poll(quiet, true);
    expect(active.unchangedPolls).toBe(0);
    expect(active.nextPollAt).toEqual(new Date(now.getTime() + 600_000));
  });

  it("spreads the next poll by the jitter ratio", () => {
    expect(poll(feed, true, 0).nextPollAt).toEqual(
      new Date(now.getTime() + 600_000 * (1 - JITTER_SPREAD)),
    );
    expect(poll(feed, true, 1).nextPollAt).toEqual(
      new Date(now.getTime() + 600_000 * (1 + JITTER_SPREAD)),
    );
  });
});

describe("afterFailedPoll", () => {
  const policy = unwrap(
    PollPolicy.create({
      intervalSeconds: 100,
      maxIntervalSeconds: 100,
      maxBackoffSeconds: 350,
    }),
  );
  const fail = (feedIn: typeof feed) =>
    afterFailedPoll(feedIn, { now, policy, jitterRatio: NO_JITTER });

  it("backs off exponentially and caps at maxBackoffSeconds", () => {
    const first = fail(feed);
    expect(first.consecutiveFailures).toBe(1);
    expect(first.nextPollAt).toEqual(new Date(now.getTime() + 200_000));

    const second = fail(first);
    expect(second.consecutiveFailures).toBe(2);
    expect(second.nextPollAt).toEqual(new Date(now.getTime() + 350_000));

    expect(fail(second).nextPollAt).toEqual(new Date(now.getTime() + 350_000));
  });

  it("leaves the unchanged-poll streak alone — failure is not quiet success", () => {
    const quiet = afterSuccessfulPoll(feed, {
      validators,
      now,
      policy: PollPolicy.DEFAULT,
      changed: false,
      jitterRatio: NO_JITTER,
    });
    expect(fail(quiet).unchangedPolls).toBe(1);
  });
});
