import {
  Feed,
  type FeedTitle,
  FeedTitle as FeedTitleFactory,
  NO_VALIDATORS,
} from "../domain/feed/feed.js";
import { FeedLanguage } from "../domain/feed/feed-language.js";
import { isMastodonAccountFeed } from "../domain/feed/feed-generator.js";
import {
  FeedUrl,
  type InvalidFeedUrl,
} from "../domain/feed/feed-url.js";
import { Handle } from "../domain/feed/handle.js";
import type { Clock } from "../domain/ports/clock.js";
import type { BlockedFeedRepository } from "../domain/ports/blocked-feed-repository.js";
import type { FeedFetcher } from "../domain/ports/feed-fetcher.js";
import type { FeedDiscoverer } from "../domain/ports/feed-discoverer.js";
import type { FeedRepository } from "../domain/ports/feed-repository.js";
import type { RegistrationGate } from "../domain/ports/registration-gate.js";
import { err, isOk, ok, type Result } from "../shared/result.js";

export type RegisterFeedError =
  | InvalidFeedUrl
  | { readonly type: "MastodonFeed" }
  | { readonly type: "FeedBlocked" }
  | {
      readonly type: "FeedUnreachable";
      readonly url: FeedUrl;
      readonly message: string;
    }
  | { readonly type: "RegistrationUnavailable"; readonly retryAfterSeconds: number | null };

export type RegisterFeedResult = {
  readonly feed: Feed;
  /** false when the URL was already registered — the call is idempotent. */
  readonly created: boolean;
};

export type RegisterFeed = {
  execute(rawUrl: string): Promise<Result<RegisterFeedResult, RegisterFeedError>>;
};

function titleFrom(raw: string | null): FeedTitle | null {
  if (raw === null) return null;
  const result = FeedTitleFactory.create(raw);
  return isOk(result) ? result.value : null;
}

function languageFrom(raw: string | null): FeedLanguage | null {
  if (raw === null) return null;
  const result = FeedLanguage.create(raw);
  return isOk(result) ? result.value : null;
}

/**
 * Registers a feed as a new actor. The URL is canonicalized, fetched once to
 * prove it is a working feed document (and to seed title/description),
 * and the handle is derived deterministically from the canonical URL
 * (ADR-0004 — always hash-suffixed, so different URLs never collide). Item
 * backlog is left to the first poll — one publishing code path.
 */
export function createRegisterFeed(deps: {
  readonly feeds: FeedRepository;
  readonly fetcher: FeedFetcher;
  readonly discoverer?: FeedDiscoverer;
  readonly blockedFeeds?: Pick<BlockedFeedRepository, "isBlocked">;
  readonly clock: Clock;
  readonly gate: RegistrationGate;
  readonly limits: { readonly daily: number; readonly total: number };
}): RegisterFeed {
  return {
    async execute(rawUrl) {
      const urlResult = FeedUrl.create(rawUrl);
      if (!urlResult.ok) return urlResult;
      let url = urlResult.value;

      const lease = await deps.gate.tryAcquire();
      if (lease === null) {
        return err({ type: "RegistrationUnavailable", retryAfterSeconds: 30 });
      }
      try {
        if (await deps.blockedFeeds?.isBlocked(url)) return err({ type: "FeedBlocked" });
        // The permit covers both existing-feed lookups and new network work.
        const registered = await deps.feeds.findByUrl(url);
        if (registered !== null) return ok({ feed: registered, created: false });
        const since = new Date(deps.clock.now().getTime() - 24 * 60 * 60 * 1000);
        const counts = await deps.feeds.registrationCounts(since);
        if (counts.total >= deps.limits.total) {
          return err({ type: "RegistrationUnavailable", retryAfterSeconds: null });
        }
        if (counts.recent >= deps.limits.daily) {
          return err({ type: "RegistrationUnavailable", retryAfterSeconds: 3600 });
        }

        let fetched = await deps.fetcher.fetch(url, NO_VALIDATORS);
        if (!fetched.ok && fetched.error.type === "InvalidFeedFormat" && deps.discoverer) {
          const discovered = await deps.discoverer.discover(url);
          if (discovered.ok) {
            let blockedCandidate = false;
            for (const candidate of discovered.value.slice(0, 8)) {
              if (await deps.blockedFeeds?.isBlocked(candidate)) {
                blockedCandidate = true;
                continue;
              }
              const existing = await deps.feeds.findByUrl(candidate);
              if (existing !== null) return ok({ feed: existing, created: false });
              const attempt = await deps.fetcher.fetch(candidate, NO_VALIDATORS);
              if (attempt.ok && attempt.value.status === "fetched") {
                url = candidate;
                fetched = attempt;
                break;
              }
            }
            if (!fetched.ok && blockedCandidate) return err({ type: "FeedBlocked" });
          }
        }
        if (!fetched.ok) {
          return err({
            type: "FeedUnreachable",
            url,
            message: fetched.error.message,
          });
        }
        const metadata =
          fetched.value.status === "fetched"
            ? fetched.value.feed
            : { title: null, description: null, language: null, generator: null };

        if (isMastodonAccountFeed(metadata.generator ?? null, url)) {
          return err({ type: "MastodonFeed" });
        }

        const handle = Handle.fromFeedUrl(url);

        const feed = Feed.register({
          url,
          handle,
          title: titleFrom(metadata.title),
          description: metadata.description,
          language: languageFrom(metadata.language),
          now: deps.clock.now(),
        });
        await deps.feeds.save(feed);
        return ok({ feed, created: true });
      } finally {
        await lease.release();
      }
    },
  };
}
