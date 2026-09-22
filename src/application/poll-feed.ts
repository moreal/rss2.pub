import {
  type ContentPolicy,
  decidePostContent,
} from "../domain/content/content-policy.js";
import { Feed, type FeedId, FeedTitle } from "../domain/feed/feed.js";
import {
  AttributionCandidates,
  type AuthorUri,
} from "../domain/feed/author-uri.js";
import {
  contentFingerprint,
  FeedItem,
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
  readonly faviconResolver: FaviconResolver;
  readonly clock: Clock;
  readonly random: Random;
  readonly pollPolicy: PollPolicy;
  readonly iconRetryPolicy: RetryPolicy;
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
          iconErrors: [],
          fetchError: fetched.error.message,
        });
      }

      if (fetched.value.status === "not-modified") {
        const scheduled = afterSuccessfulPoll(feed, {
          validators: feed.validators,
          now,
          policy: deps.pollPolicy,
          // A 304 is the definition of a quiet poll: stretch the interval.
          changed: false,
          jitterRatio: deps.random.ratio(),
        });
        await deps.feeds.save(scheduled);
        const actorUpdate = await deps.federation.updateActor(scheduled);
        if (
          actorUpdate.ok
          && actorUpdate.value.profileFingerprint
            !== scheduled.actorProfileFingerprint
        ) {
          await deps.feeds.save(
            Feed.withActorProfileFingerprint(
              scheduled,
              actorUpdate.value.profileFingerprint,
            ),
          );
        }
        return ok({
          feedId: feed.id,
          status: "not-modified",
          published: 0,
          updated: 0,
          publishErrors: actorUpdate.ok ? [] : [actorUpdate.error.message],
          attributionErrors: [],
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

      const publishedRecords: PublishedItemRecord[] = [];
      const publishErrors: string[] = [];
      const attributionErrors: string[] = [];
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
        const attributions = await resolveAuthors(item);
        const result = await deps.federation.publish(
          feed,
          item.key,
          decidePostContent(item, deps.contentPolicy),
          attributions,
        );
        if (result.ok) {
          publishedRecords.push({
            key: item.key,
            publishedAt: now,
            contentFingerprint: contentFingerprint(item),
            messageUri: result.value.messageUri,
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
        const attributions = await resolveAuthors(item);
        const result = await deps.federation.update(
          feed,
          record.messageUri,
          decidePostContent(item, deps.contentPolicy),
          attributions,
        );
        if (result.ok) {
          await deps.items.markUpdated(feed.id, item.key, fingerprint);
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
      const scheduled = afterSuccessfulPoll(
        Feed.withIconRetry(withMetadata, icon.retry),
        {
          validators: fetched.value.validators,
          now,
          policy: deps.pollPolicy,
          changed: publishedRecords.length > 0 || updatedCount > 0,
          jitterRatio: deps.random.ratio(),
        },
      );
      await deps.feeds.save(scheduled);
      const actorUpdate = await deps.federation.updateActor(scheduled);
      if (actorUpdate.ok) {
        if (
          actorUpdate.value.profileFingerprint
            !== scheduled.actorProfileFingerprint
        ) {
          await deps.feeds.save(
            Feed.withActorProfileFingerprint(
              scheduled,
              actorUpdate.value.profileFingerprint,
            ),
          );
        }
      } else {
        publishErrors.push(actorUpdate.error.message);
      }

      return ok({
        feedId: feed.id,
        status: "polled",
        published: publishedRecords.length,
        updated: updatedCount,
        publishErrors,
        attributionErrors,
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
