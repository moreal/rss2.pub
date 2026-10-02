import { describe, expect, it } from "vitest";
import { collectionState } from "../../../../src/domain/feed/collection-state.js";
import { afterFailedPoll, afterSuccessfulPoll, PollPolicy } from "../../../../src/domain/feed/poll-policy.js";
import { makeFeed } from "../../../helpers/fakes.js";

describe("feed collection state", () => {
  const checkedAt = new Date("2026-10-02T09:00:00Z");
  it("waits for the first recorded check", () => {
    const feed = makeFeed();
    expect(collectionState(feed)).toBe("pending");
    expect(feed.lastPolledAt).toBeNull();
    expect(feed.lastSuccessfulPollAt).toBeNull();
  });
  it("records a successful check even when there are no new posts", () => {
    const feed = afterSuccessfulPoll(makeFeed(), {
      now: checkedAt, policy: PollPolicy.DEFAULT, validators: { etag: null, lastModified: null },
      changed: false, jitterRatio: 0,
    });
    expect(collectionState(feed)).toBe("healthy");
    expect(feed.lastPolledAt).toEqual(checkedAt);
    expect(feed.lastSuccessfulPollAt).toEqual(checkedAt);
  });
  it("preserves the last successful check when a later request fails", () => {
    const healthy = afterSuccessfulPoll(makeFeed(), {
      now: checkedAt, policy: PollPolicy.DEFAULT, validators: { etag: null, lastModified: null },
      changed: true, jitterRatio: 0,
    });
    const failedAt = new Date("2026-10-02T10:00:00Z");
    const failed = afterFailedPoll(healthy, { now: failedAt, policy: PollPolicy.DEFAULT, jitterRatio: 0 });
    expect(collectionState(failed)).toBe("failed");
    expect(failed.lastPolledAt).toEqual(failedAt);
    expect(failed.lastSuccessfulPollAt).toEqual(checkedAt);
  });
  it("recovers from an initial failure after a successful check", () => {
    const failed = afterFailedPoll(makeFeed(), { now: checkedAt, policy: PollPolicy.DEFAULT, jitterRatio: 0 });
    expect(collectionState(failed)).toBe("failed");
    expect(failed.lastSuccessfulPollAt).toBeNull();
    const recovered = afterSuccessfulPoll(failed, {
      now: checkedAt, policy: PollPolicy.DEFAULT, validators: { etag: null, lastModified: null },
      changed: false, jitterRatio: 0,
    });
    expect(collectionState(recovered)).toBe("healthy");
  });
});
