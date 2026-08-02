import { describe, expect, it } from "vitest";
import { Feed } from "../../../../src/domain/feed/feed.js";
import { FeedUrl } from "../../../../src/domain/feed/feed-url.js";
import { Handle } from "../../../../src/domain/feed/handle.js";
import {
  afterFailedPoll,
  afterSuccessfulPoll,
  isDue,
  PollPolicy,
} from "../../../../src/domain/feed/poll-policy.js";
import { unwrap, unwrapErr } from "../../../helpers/result.js";

const url = unwrap(FeedUrl.create("https://a.co/f"));
const now = new Date("2026-07-26T12:00:00Z");
const feed = Feed.register({
  url,
  handle: Handle.fromFeedUrl(url),
  title: null,
  description: null,
  now,
});

describe("PollPolicy.create", () => {
  it("rejects non-positive or fractional intervals", () => {
    expect(
      unwrapErr(PollPolicy.create({ intervalSeconds: 0, maxBackoffSeconds: 10 })),
    ).toMatchObject({ reason: "IntervalOutOfRange" });
    expect(
      unwrapErr(
        PollPolicy.create({ intervalSeconds: 1.5, maxBackoffSeconds: 10 }),
      ),
    ).toMatchObject({ reason: "IntervalOutOfRange" });
  });

  it("rejects a max backoff below the base interval", () => {
    expect(
      unwrapErr(
        PollPolicy.create({ intervalSeconds: 100, maxBackoffSeconds: 99 }),
      ),
    ).toMatchObject({ reason: "MaxBackoffBelowInterval" });
  });

  it("accepts a sane policy", () => {
    expect(
      unwrap(PollPolicy.create({ intervalSeconds: 600, maxBackoffSeconds: 86_400 })),
    ).toEqual({ intervalSeconds: 600, maxBackoffSeconds: 86_400 });
  });
});

describe("isDue", () => {
  it("treats nextPollAt <= now as due", () => {
    expect(isDue(feed, now)).toBe(true);
    expect(isDue(feed, new Date(now.getTime() - 1))).toBe(false);
    expect(isDue(feed, new Date(now.getTime() + 1))).toBe(true);
  });
});

describe("afterSuccessfulPoll", () => {
  it("stores validators, resets failures, schedules one interval ahead", () => {
    const failing = afterFailedPoll(feed, { now, policy: PollPolicy.DEFAULT });
    const validators = { etag: 'W/"abc"', lastModified: "Sat, 26 Jul 2026 11:00:00 GMT" };
    const polled = afterSuccessfulPoll(failing, {
      validators,
      now,
      policy: PollPolicy.DEFAULT,
    });
    expect(polled.validators).toEqual(validators);
    expect(polled.consecutiveFailures).toBe(0);
    expect(polled.nextPollAt).toEqual(new Date(now.getTime() + 600_000));
  });
});

describe("afterFailedPoll", () => {
  const policy = unwrap(
    PollPolicy.create({ intervalSeconds: 100, maxBackoffSeconds: 350 }),
  );

  it("backs off exponentially and caps at maxBackoffSeconds", () => {
    const first = afterFailedPoll(feed, { now, policy });
    expect(first.consecutiveFailures).toBe(1);
    expect(first.nextPollAt).toEqual(new Date(now.getTime() + 200_000));

    const second = afterFailedPoll(first, { now, policy });
    expect(second.consecutiveFailures).toBe(2);
    expect(second.nextPollAt).toEqual(new Date(now.getTime() + 350_000));

    const third = afterFailedPoll(second, { now, policy });
    expect(third.nextPollAt).toEqual(new Date(now.getTime() + 350_000));
  });
});
