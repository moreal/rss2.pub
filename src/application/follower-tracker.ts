import { Handle, type InvalidHandle } from "../domain/feed/handle.js";
import type { FeedRepository } from "../domain/ports/feed-repository.js";
import { err, ok, type Result } from "../shared/result.js";

export type FollowerTrackerError =
  | InvalidHandle
  | { readonly type: "UnknownFeed"; readonly handle: Handle };

/**
 * Keeps the per-feed follower counter (recommendation ranking) in sync with
 * follow/unfollow events surfaced by the federation adapter.
 */
export type FollowerTracker = {
  recordFollow(rawHandle: string): Promise<Result<void, FollowerTrackerError>>;
  recordUnfollow(rawHandle: string): Promise<Result<void, FollowerTrackerError>>;
};

export function createFollowerTracker(deps: {
  readonly feeds: FeedRepository;
}): FollowerTracker {
  async function adjust(
    rawHandle: string,
    delta: 1 | -1,
  ): Promise<Result<void, FollowerTrackerError>> {
    const handleResult = Handle.create(rawHandle);
    if (!handleResult.ok) return handleResult;
    const feed = await deps.feeds.findByHandle(handleResult.value);
    if (feed === null) {
      return err({ type: "UnknownFeed", handle: handleResult.value });
    }
    await deps.feeds.adjustFollowerCount(feed.id, delta);
    return ok(undefined);
  }

  return {
    recordFollow: (rawHandle) => adjust(rawHandle, 1),
    recordUnfollow: (rawHandle) => adjust(rawHandle, -1),
  };
}
