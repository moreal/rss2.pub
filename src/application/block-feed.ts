import { FeedUrl, type InvalidFeedUrl } from "../domain/feed/feed-url.js";
import type { BlockedFeedRepository } from "../domain/ports/blocked-feed-repository.js";
import type { FeedRepository } from "../domain/ports/feed-repository.js";
import { ok, type Result } from "../shared/result.js";
import type { UnregisterFeed } from "./unregister-feed.js";

export function createBlockFeed(deps: {
  readonly feeds: FeedRepository;
  readonly blockedFeeds: BlockedFeedRepository;
  readonly unregisterFeed: UnregisterFeed;
}) {
  return {
    async execute(rawUrl: string, reason: string): Promise<Result<{ removed: boolean }, InvalidFeedUrl>> {
      const parsed = FeedUrl.create(rawUrl);
      if (!parsed.ok) return parsed;
      const url = parsed.value;
      await deps.blockedFeeds.block(url, reason);
      const feed = await deps.feeds.findByUrl(url);
      if (feed === null) return ok({ removed: false });
      const removed = await deps.unregisterFeed.execute(feed.handle);
      return ok({ removed: removed.ok });
    },
  };
}
