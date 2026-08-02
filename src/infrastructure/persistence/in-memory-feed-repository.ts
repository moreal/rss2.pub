import type { Feed, FeedId } from "../../domain/feed/feed.js";
import type { FeedUrl } from "../../domain/feed/feed-url.js";
import type { Handle } from "../../domain/feed/handle.js";
import type {
  FeedRepository,
  PopularFeed,
} from "../../domain/ports/feed-repository.js";

/**
 * Reference implementation of FeedRepository. Used as the unit-test double
 * and as the executable specification the Drizzle adapter must match.
 */
export function createInMemoryFeedRepository(): FeedRepository & {
  readonly followerCountOf: (id: FeedId) => number;
} {
  const feeds = new Map<FeedId, Feed>();
  const followerCounts = new Map<FeedId, number>();

  return {
    async save(feed: Feed): Promise<void> {
      feeds.set(feed.id, feed);
    },

    async findById(id: FeedId): Promise<Feed | null> {
      return feeds.get(id) ?? null;
    },

    async findByUrl(url: FeedUrl): Promise<Feed | null> {
      for (const feed of feeds.values()) if (feed.url === url) return feed;
      return null;
    },

    async findByHandle(handle: Handle): Promise<Feed | null> {
      for (const feed of feeds.values()) {
        if (feed.handle === handle) return feed;
      }
      return null;
    },

    async listDue(now: Date): Promise<Feed[]> {
      return [...feeds.values()].filter(
        (feed) => feed.nextPollAt.getTime() <= now.getTime(),
      );
    },

    async search(keyword: string, limit: number): Promise<Feed[]> {
      const needle = keyword.toLowerCase();
      return [...feeds.values()]
        .filter((feed) =>
          [feed.handle, feed.title ?? "", feed.description ?? "", feed.url]
            .join("\n")
            .toLowerCase()
            .includes(needle),
        )
        .sort((a, b) => a.handle.localeCompare(b.handle))
        .slice(0, limit);
    },

    async listPopular(limit: number): Promise<PopularFeed[]> {
      return [...feeds.values()]
        .map((feed) => ({
          feed,
          followerCount: followerCounts.get(feed.id) ?? 0,
        }))
        .sort(
          (a, b) =>
            b.followerCount - a.followerCount ||
            a.feed.handle.localeCompare(b.feed.handle),
        )
        .slice(0, limit);
    },

    async adjustFollowerCount(id: FeedId, delta: number): Promise<void> {
      const current = followerCounts.get(id) ?? 0;
      followerCounts.set(id, Math.max(0, current + delta));
    },

    async remove(id: FeedId): Promise<void> {
      feeds.delete(id);
      followerCounts.delete(id);
    },

    followerCountOf(id: FeedId): number {
      return followerCounts.get(id) ?? 0;
    },
  };
}
