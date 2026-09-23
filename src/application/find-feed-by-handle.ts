import type { Feed } from "../domain/feed/feed.js";
import { Handle, type InvalidHandle } from "../domain/feed/handle.js";
import type { FeedRepository } from "../domain/ports/feed-repository.js";
import { err, ok, type Result } from "../shared/result.js";

export type FindFeedByHandleError =
  | InvalidHandle
  | { readonly type: "FeedNotFound" };

export type FindFeedByHandle = {
  execute(rawHandle: string): Promise<Result<Feed, FindFeedByHandleError>>;
};

/** Resolves a public actor handle to the registered feed. */
export function createFindFeedByHandle(deps: {
  readonly feeds: FeedRepository;
}): FindFeedByHandle {
  return {
    async execute(rawHandle) {
      const parsed = Handle.create(rawHandle);
      if (!parsed.ok) return parsed;
      const feed = await deps.feeds.findByHandle(parsed.value);
      return feed === null ? err({ type: "FeedNotFound" }) : ok(feed);
    },
  };
}
