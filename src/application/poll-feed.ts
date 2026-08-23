import {
  type ContentPolicy,
  decidePostContent,
} from "../domain/content/content-policy.js";
import { Feed, type FeedId, FeedTitle } from "../domain/feed/feed.js";
import { FeedItem } from "../domain/feed/feed-item.js";
import { IconUrl } from "../domain/feed/icon-url.js";
import {
  afterFailedPoll,
  afterSuccessfulPoll,
  type PollPolicy,
} from "../domain/feed/poll-policy.js";
import type { ContentExtractor } from "../domain/ports/content-extractor.js";
import type { Clock } from "../domain/ports/clock.js";
import type { FaviconResolver } from "../domain/ports/favicon-resolver.js";
import type { FeedFetcher, FetchedFeed } from "../domain/ports/feed-fetcher.js";
import type { FeedRepository } from "../domain/ports/feed-repository.js";
import type { FederationGateway } from "../domain/ports/federation-gateway.js";
import type {
  ItemRepository,
  PublishedItemRecord,
} from "../domain/ports/item-repository.js";
import { err, isOk, ok, type Result } from "../shared/result.js";

export type PollFeedReport = {
  readonly feedId: FeedId;
  readonly status: "polled" | "not-modified" | "fetch-failed";
  readonly published: number;
  /** Per-item publish failures; failed items stay unmarked and retry next poll. */
  readonly publishErrors: readonly string[];
  readonly fetchError: string | null;
};

export type PollFeedError = {
  readonly type: "FeedNotFound";
  readonly feedId: FeedId;
};

export type PollFeed = {
  execute(feedId: FeedId): Promise<Result<PollFeedReport, PollFeedError>>;
};

function parseItems(fetched: FetchedFeed) {
  const byKey = new Map<string, FeedItem>();
  for (const raw of fetched.items) {
    const parsed = FeedItem.fromRaw(raw);
    if (isOk(parsed) && !byKey.has(parsed.value.key)) {
      byKey.set(parsed.value.key, parsed.value);
    }
  }
  return [...byKey.values()];
}

/**
 * Replaces an item's teaser content with its extracted full article
 * (ADR-0009). Only called for feeds with `fullContentEnabled`; extraction
 * failure (no link, request failure, no article found) falls back silently
 * to the feed-provided content rather than blocking the publish.
 */
async function withFullContent(
  item: FeedItem,
  extractor: ContentExtractor,
): Promise<FeedItem> {
  if (item.link === null) return item;
  const extracted = await extractor.extract(item.link);
  return extracted.ok ? { ...item, contentHtml: extracted.value.contentHtml } : item;
}

/**
 * Resolves the actor avatar from the channel link's favicon (ADR-0010).
 * Only attempted while the feed has no icon yet — once found it is never
 * re-fetched, and a failed attempt just leaves it null for a later poll to
 * retry rather than blocking or failing this one.
 */
async function resolveIcon(
  feed: Feed,
  channelLink: string | null,
  resolver: FaviconResolver,
): Promise<IconUrl | null> {
  if (feed.iconUrl !== null || channelLink === null) return null;
  const resolved = await resolver.resolve(channelLink);
  if (!resolved.ok) return null;
  const iconUrl = IconUrl.create(resolved.value.iconUrl);
  return isOk(iconUrl) ? iconUrl.value : null;
}

/**
 * One poll cycle for one feed: conditional fetch → identify new items →
 * publish oldest-first → remember published keys → refresh metadata and
 * reschedule (success interval or failure backoff).
 */
export function createPollFeed(deps: {
  readonly feeds: FeedRepository;
  readonly items: ItemRepository;
  readonly fetcher: FeedFetcher;
  readonly federation: FederationGateway;
  readonly contentExtractor: ContentExtractor;
  readonly faviconResolver: FaviconResolver;
  readonly clock: Clock;
  readonly pollPolicy: PollPolicy;
  readonly contentPolicy: ContentPolicy;
}): PollFeed {
  return {
    async execute(feedId) {
      const feed = await deps.feeds.findById(feedId);
      if (feed === null) return err({ type: "FeedNotFound", feedId });

      const fetched = await deps.fetcher.fetch(feed.url, feed.validators);
      const now = deps.clock.now();

      if (!fetched.ok) {
        await deps.feeds.save(
          afterFailedPoll(feed, { now, policy: deps.pollPolicy }),
        );
        return ok({
          feedId: feed.id,
          status: "fetch-failed",
          published: 0,
          publishErrors: [],
          fetchError: fetched.error.message,
        });
      }

      if (fetched.value.status === "not-modified") {
        await deps.feeds.save(
          afterSuccessfulPoll(feed, {
            validators: feed.validators,
            now,
            policy: deps.pollPolicy,
          }),
        );
        return ok({
          feedId: feed.id,
          status: "not-modified",
          published: 0,
          publishErrors: [],
          fetchError: null,
        });
      }

      const items = parseItems(fetched.value.feed);
      const newKeys = new Set(
        await deps.items.filterNew(
          feed.id,
          items.map((item) => item.key),
        ),
      );
      const toPublish = items
        .filter((item) => newKeys.has(item.key))
        .sort(
          (a, b) =>
            (a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0),
        );

      const publishedRecords: PublishedItemRecord[] = [];
      const publishErrors: string[] = [];
      for (const item of toPublish) {
        const enriched = feed.fullContentEnabled
          ? await withFullContent(item, deps.contentExtractor)
          : item;
        const content = decidePostContent(enriched, deps.contentPolicy);
        const result = await deps.federation.publish(feed, content);
        if (result.ok) {
          publishedRecords.push({ key: item.key, publishedAt: now });
        } else {
          publishErrors.push(result.error.message);
        }
      }
      if (publishedRecords.length > 0) {
        await deps.items.markPublished(feed.id, publishedRecords);
      }

      const metadataTitle =
        fetched.value.feed.title !== null
          ? FeedTitle.create(fetched.value.feed.title)
          : null;
      const iconUrl = await resolveIcon(
        feed,
        fetched.value.feed.link,
        deps.faviconResolver,
      );
      const withMetadata = Feed.withMetadata(feed, {
        title:
          metadataTitle !== null && isOk(metadataTitle)
            ? metadataTitle.value
            : null,
        description: fetched.value.feed.description,
        iconUrl,
      });
      await deps.feeds.save(
        afterSuccessfulPoll(withMetadata, {
          validators: fetched.value.validators,
          now,
          policy: deps.pollPolicy,
        }),
      );

      return ok({
        feedId: feed.id,
        status: "polled",
        published: publishedRecords.length,
        publishErrors,
        fetchError: null,
      });
    },
  };
}

export type PollDueFeeds = {
  execute(): Promise<PollFeedReport[]>;
};

/** Polls every feed whose nextPollAt has passed. */
export function createPollDueFeeds(deps: {
  readonly feeds: FeedRepository;
  readonly pollFeed: PollFeed;
  readonly clock: Clock;
}): PollDueFeeds {
  return {
    async execute() {
      const due = await deps.feeds.listDue(deps.clock.now());
      const reports: PollFeedReport[] = [];
      for (const feed of due) {
        const result = await deps.pollFeed.execute(feed.id);
        if (isOk(result)) reports.push(result.value);
      }
      return reports;
    },
  };
}
