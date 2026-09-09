import {
  type ContentPolicy,
  decidePostContent,
  type PostContent,
} from "../domain/content/content-policy.js";
import { Feed, type FeedId, FeedTitle } from "../domain/feed/feed.js";
import {
  AttributionCandidates,
  type AuthorUri,
} from "../domain/feed/author-uri.js";
import {
  contentFingerprint,
  FeedItem,
  type ItemKey,
} from "../domain/feed/feed-item.js";
import { FeedLanguage } from "../domain/feed/feed-language.js";
import { IconUrl } from "../domain/feed/icon-url.js";
import {
  afterFailedPoll,
  afterSuccessfulPoll,
  type PollPolicy,
} from "../domain/feed/poll-policy.js";
import {
  afterFailure,
  hasGivenUp,
  isRetryDue,
  type RetryPolicy,
  type RetryState,
} from "../domain/feed/retry-policy.js";
import type { ContentExtractor } from "../domain/ports/content-extractor.js";
import type {
  ActorLookupError,
  ActorResolver,
  ResolvedActorUri,
} from "../domain/ports/actor-resolver.js";
import type { Clock } from "../domain/ports/clock.js";
import type {
  FaviconResolver,
  ResolveFaviconError,
} from "../domain/ports/favicon-resolver.js";
import type { Random } from "../domain/ports/random.js";
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
  /** Items whose content changed and were re-published via an Update activity. */
  readonly updated: number;
  /** Per-item publish/update failures; failed items stay unmarked and retry next poll. */
  readonly publishErrors: readonly string[];
  /** Best-effort author lookup failures; never make the poll fail. */
  readonly attributionErrors: readonly string[];
  /** Full-content extraction failures (ADR-0009). The teaser is published
   * instead and the article page is retried on a later poll — surfaced here
   * because a silent fallback is indistinguishable from a working bridge. */
  readonly extractionErrors: readonly string[];
  /** Favicon resolution failures (ADR-0010); cosmetic, and given up on. */
  readonly iconErrors: readonly string[];
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

const INITIAL_RETRY: RetryState = { failures: 0, nextAttemptAt: null };

/** What an item was last published with, as far as extraction is concerned. */
type ExtractionHistory = {
  readonly fullContentUsed: boolean;
  readonly extractRetry: RetryState;
};

type ExtractionAttempt =
  | {
      readonly kind: "content";
      readonly content: PostContent;
      readonly fullContentUsed: boolean;
      readonly retry: RetryState;
      readonly error: string | null;
    }
  | {
      /**
       * Extraction failed for an item that is already federated *with* its
       * full article. Publishing the teaser now would overwrite the article
       * and adopt the new fingerprint, losing it for good, so the caller
       * skips this item and retries the whole edit on a later poll.
       */
      readonly kind: "keep-published";
      readonly retry: RetryState;
      readonly error: string;
    };

type ExtractionContext = {
  readonly feed: Feed;
  readonly contentExtractor: ContentExtractor;
  readonly contentPolicy: ContentPolicy;
  readonly retryPolicy: RetryPolicy;
  readonly random: Random;
  readonly now: Date;
};

/**
 * Builds what to publish for one item, fetching the original article first
 * in full-content mode (ADR-0009).
 *
 * A failure publishes the feed's own teaser — timeliness beats completeness —
 * but unlike before it is *recorded*: the item keeps a retry budget, is tried
 * again on a later poll, and is upgraded to the article once that succeeds.
 */
async function extractContent(
  item: FeedItem,
  ctx: ExtractionContext,
  previous: ExtractionHistory | null,
): Promise<ExtractionAttempt> {
  const retry = previous?.extractRetry ?? INITIAL_RETRY;
  const teaser = (state: RetryState, error: string | null): ExtractionAttempt => ({
    kind: "content",
    content: decidePostContent(item, ctx.contentPolicy),
    fullContentUsed: false,
    retry: state,
    error,
  });

  if (!ctx.feed.fullContentEnabled || item.link === null) {
    return teaser(retry, null);
  }
  // An item already carrying full content must re-extract whatever its retry
  // budget says: its feed-side text changed, and only the article page can
  // rebuild the body that is federated right now.
  if (
    previous?.fullContentUsed !== true &&
    (hasGivenUp(ctx.retryPolicy, retry) || !isRetryDue(retry, ctx.now))
  ) {
    return teaser(retry, null);
  }

  const extracted = await ctx.contentExtractor.extract(item.link);
  if (extracted.ok) {
    return {
      kind: "content",
      content: decidePostContent(
        { ...item, contentHtml: extracted.value.contentHtml },
        ctx.contentPolicy,
      ),
      fullContentUsed: true,
      retry: INITIAL_RETRY,
      error: null,
    };
  }

  const next = afterFailure(ctx.retryPolicy, retry, {
    now: ctx.now,
    jitterRatio: ctx.random.ratio(),
  });
  return previous?.fullContentUsed === true
    ? { kind: "keep-published", retry: next, error: extracted.error.message }
    : teaser(next, extracted.error.message);
}

function languageFrom(raw: string | null): FeedLanguage | null {
  if (raw === null) return null;
  const result = FeedLanguage.create(raw);
  return isOk(result) ? result.value : null;
}

function faviconErrorMessage(error: ResolveFaviconError): string {
  return error.type === "NotFound"
    ? `no icon found at ${error.url}`
    : error.message;
}

/**
 * Resolves the actor avatar from the channel link's favicon (ADR-0010).
 * Only attempted while the feed has no icon yet — once found it is never
 * re-fetched.
 *
 * A failure now costs a retry from the feed's budget instead of one wasted
 * request on every single poll forever, which is what "leave it null and try
 * again next time" amounted to on a site that serves no usable icon.
 */
async function resolveIcon(
  feed: Feed,
  channelLink: string | null,
  ctx: {
    readonly resolver: FaviconResolver;
    readonly retryPolicy: RetryPolicy;
    readonly random: Random;
    readonly now: Date;
  },
): Promise<{
  readonly iconUrl: IconUrl | null;
  readonly retry: RetryState;
  readonly error: string | null;
}> {
  const retry = feed.iconRetry;
  if (
    feed.iconUrl !== null ||
    channelLink === null ||
    hasGivenUp(ctx.retryPolicy, retry) ||
    !isRetryDue(retry, ctx.now)
  ) {
    return { iconUrl: null, retry, error: null };
  }

  const failed = (error: string) => ({
    iconUrl: null,
    retry: afterFailure(ctx.retryPolicy, retry, {
      now: ctx.now,
      jitterRatio: ctx.random.ratio(),
    }),
    error,
  });

  const resolved = await ctx.resolver.resolve(channelLink);
  if (!resolved.ok) return failed(faviconErrorMessage(resolved.error));
  const iconUrl = IconUrl.create(resolved.value.iconUrl);
  return isOk(iconUrl)
    ? { iconUrl: iconUrl.value, retry: INITIAL_RETRY, error: null }
    : failed(`unusable icon URL: ${resolved.value.iconUrl}`);
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
  readonly actorResolver: ActorResolver;
  readonly contentExtractor: ContentExtractor;
  readonly faviconResolver: FaviconResolver;
  readonly clock: Clock;
  readonly random: Random;
  readonly pollPolicy: PollPolicy;
  readonly iconRetryPolicy: RetryPolicy;
  readonly extractRetryPolicy: RetryPolicy;
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
          afterFailedPoll(feed, {
            now,
            policy: deps.pollPolicy,
            jitterRatio: deps.random.ratio(),
          }),
        );
        return ok({
          feedId: feed.id,
          status: "fetch-failed",
          published: 0,
          updated: 0,
          publishErrors: [],
          attributionErrors: [],
          extractionErrors: [],
          iconErrors: [],
          fetchError: fetched.error.message,
        });
      }

      if (fetched.value.status === "not-modified") {
        await deps.feeds.save(
          afterSuccessfulPoll(feed, {
            validators: feed.validators,
            now,
            policy: deps.pollPolicy,
            // A 304 is the definition of a quiet poll: stretch the interval.
            changed: false,
            jitterRatio: deps.random.ratio(),
          }),
        );
        return ok({
          feedId: feed.id,
          status: "not-modified",
          published: 0,
          updated: 0,
          publishErrors: [],
          attributionErrors: [],
          extractionErrors: [],
          iconErrors: [],
          fetchError: null,
        });
      }

      const items = parseItems(fetched.value.feed);
      const currentLanguage =
        languageFrom(fetched.value.feed.language) ?? feed.language;

      const existing = new Map(
        (
          await deps.items.findExisting(
            feed.id,
            items.map((item) => item.key),
          )
        ).map((record) => [record.key, record]),
      );

      const toPublish = items
        .filter((item) => !existing.has(item.key))
        .sort(
          (a, b) =>
            (a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0),
        );
      const toUpdate = items.flatMap((item) => {
        const record = existing.get(item.key);
        if (record === undefined) return [];
        const fingerprint = contentFingerprint(item);
        return fingerprint === record.contentFingerprint
          ? []
          : [{ item, record, fingerprint }];
      });

      const buildCtx: ExtractionContext = {
        feed,
        contentExtractor: deps.contentExtractor,
        contentPolicy: deps.contentPolicy,
        retryPolicy: deps.extractRetryPolicy,
        random: deps.random,
        now,
      };

      const publishedRecords: PublishedItemRecord[] = [];
      const publishErrors: string[] = [];
      const attributionErrors: string[] = [];
      const extractionErrors: string[] = [];
      const iconErrors: string[] = [];
      const failedCandidates = new Set<AuthorUri>();
      const actorMemo = new Map<
        AuthorUri,
        Promise<Result<ResolvedActorUri | null, ActorLookupError>>
      >();

      async function resolveAuthors(item: FeedItem): Promise<ResolvedActorUri[]> {
        const candidates = AttributionCandidates.values(item.authors);
        const results = await Promise.all(candidates.map((uri) => {
          const existing = actorMemo.get(uri);
          if (existing !== undefined) return existing;
          const pending = deps.actorResolver.resolve(uri);
          actorMemo.set(uri, pending);
          return pending;
        }));
        const seen = new Set<string>();
        const resolved: ResolvedActorUri[] = [];
        for (let index = 0; index < results.length; index++) {
          const result = results[index];
          const candidate = candidates[index];
          if (result === undefined || candidate === undefined) continue;
          if (!result.ok) {
            if (!failedCandidates.has(candidate)) {
              failedCandidates.add(candidate);
              attributionErrors.push(result.error.message);
            }
            continue;
          }
          if (result.value === null || seen.has(result.value)) continue;
          seen.add(result.value);
          resolved.push(result.value);
        }
        return resolved;
      }

      for (const item of toPublish) {
        // A never-published item has no full-content object to protect, so
        // extraction here can only ever come back as content.
        const attempt = await extractContent(item, buildCtx, null);
        if (attempt.error !== null) extractionErrors.push(attempt.error);
        if (attempt.kind !== "content") continue;
        const attributions = await resolveAuthors(item);
        const result = await deps.federation.publish(
          feed,
          item.key,
          attempt.content,
          attributions,
        );
        if (result.ok) {
          publishedRecords.push({
            key: item.key,
            publishedAt: now,
            contentFingerprint: contentFingerprint(item),
            messageUri: result.value.messageUri,
            fullContentUsed: attempt.fullContentUsed,
            extractRetry: attempt.retry,
          });
        } else {
          publishErrors.push(result.error.message);
        }
      }
      if (publishedRecords.length > 0) {
        await deps.items.markPublished(feed.id, publishedRecords);
      }

      let updatedCount = 0;
      for (const { item, record, fingerprint } of toUpdate) {
        if (record.messageUri === null) {
          // Pre-migration row: no way to locate the federated object to
          // edit it. Adopt the new baseline silently rather than treating
          // an untracked change as one we could have acted on.
          await deps.items.markUpdated(feed.id, item.key, fingerprint);
          continue;
        }
        const attempt = await extractContent(item, buildCtx, record);
        if (attempt.error !== null) extractionErrors.push(attempt.error);
        if (attempt.kind === "keep-published") {
          // Deliberately leaves the fingerprint alone: the edit is still
          // pending, and a later poll retries it rather than replacing a
          // federated article with the feed's teaser.
          await deps.items.markExtraction(feed.id, item.key, {
            fullContentUsed: true,
            extractRetry: attempt.retry,
          });
          continue;
        }
        const attributions = await resolveAuthors(item);
        const result = await deps.federation.update(
          feed,
          record.messageUri,
          attempt.content,
          attributions,
        );
        if (result.ok) {
          await deps.items.markUpdated(feed.id, item.key, fingerprint);
          await deps.items.markExtraction(feed.id, item.key, {
            fullContentUsed: attempt.fullContentUsed,
            extractRetry: attempt.retry,
          });
          updatedCount++;
        } else {
          publishErrors.push(result.error.message);
        }
      }

      // Items the feed has not touched, but whose article extraction failed
      // earlier and is due for another try. Without this pass a single 403
      // pinned an item to its teaser permanently, even after the origin
      // started answering again.
      const handled = new Set<ItemKey>([
        ...toPublish.map((item) => item.key),
        ...toUpdate.map((pending) => pending.item.key),
      ]);
      for (const item of items) {
        if (handled.has(item.key) || !feed.fullContentEnabled) continue;
        const record = existing.get(item.key);
        if (
          record === undefined ||
          record.messageUri === null ||
          record.fullContentUsed ||
          item.link === null ||
          hasGivenUp(deps.extractRetryPolicy, record.extractRetry) ||
          !isRetryDue(record.extractRetry, now)
        ) {
          continue;
        }

        const attempt = await extractContent(item, buildCtx, record);
        if (attempt.error !== null) extractionErrors.push(attempt.error);
        if (attempt.kind !== "content" || !attempt.fullContentUsed) {
          await deps.items.markExtraction(feed.id, item.key, {
            fullContentUsed: false,
            extractRetry: attempt.retry,
          });
          continue;
        }
        const attributions = await resolveAuthors(item);
        const result = await deps.federation.update(
          feed,
          record.messageUri,
          attempt.content,
          attributions,
        );
        if (result.ok) {
          await deps.items.markExtraction(feed.id, item.key, {
            fullContentUsed: true,
            extractRetry: attempt.retry,
          });
          updatedCount++;
        } else {
          publishErrors.push(result.error.message);
        }
      }

      const metadataTitle =
        fetched.value.feed.title !== null
          ? FeedTitle.create(fetched.value.feed.title)
          : null;
      const icon = await resolveIcon(feed, fetched.value.feed.link, {
        resolver: deps.faviconResolver,
        retryPolicy: deps.iconRetryPolicy,
        random: deps.random,
        now,
      });
      if (icon.error !== null) iconErrors.push(icon.error);
      const withMetadata = Feed.withMetadata(feed, {
        title:
          metadataTitle !== null && isOk(metadataTitle)
            ? metadataTitle.value
            : null,
        description: fetched.value.feed.description,
        iconUrl: icon.iconUrl,
        language: currentLanguage,
      });
      await deps.feeds.save(
        afterSuccessfulPoll(Feed.withIconRetry(withMetadata, icon.retry), {
          validators: fetched.value.validators,
          now,
          policy: deps.pollPolicy,
          changed: publishedRecords.length > 0 || updatedCount > 0,
          jitterRatio: deps.random.ratio(),
        }),
      );

      return ok({
        feedId: feed.id,
        status: "polled",
        published: publishedRecords.length,
        updated: updatedCount,
        publishErrors,
        attributionErrors,
        extractionErrors,
        iconErrors,
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
