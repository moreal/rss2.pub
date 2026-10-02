import { stripHtml } from "../domain/content/html.js";
import { Feed, type FeedTitle, FeedTitle as FeedTitleFactory, NO_VALIDATORS } from "../domain/feed/feed.js";
import type { FeedCandidate } from "../domain/feed/feed-candidate.js";
import { FeedLanguage } from "../domain/feed/feed-language.js";
import { isMastodonAccountFeed } from "../domain/feed/feed-generator.js";
import { FeedUrl, type InvalidFeedUrl } from "../domain/feed/feed-url.js";
import { Handle } from "../domain/feed/handle.js";
import type { Clock } from "../domain/ports/clock.js";
import type { BlockedFeedRepository } from "../domain/ports/blocked-feed-repository.js";
import type { FeedFetcher, FetchFeedSuccess } from "../domain/ports/feed-fetcher.js";
import type { FeedDiscoverer } from "../domain/ports/feed-discoverer.js";
import type { FeedRepository } from "../domain/ports/feed-repository.js";
import type { RegistrationGate } from "../domain/ports/registration-gate.js";
import { err, isOk, ok, type Result } from "../shared/result.js";

export type RegisterFeedError =
  | InvalidFeedUrl
  | { readonly type: "MastodonFeed"; readonly accountUrl?: string }
  | { readonly type: "FeedBlocked" }
  | { readonly type: "MultipleFeeds"; readonly candidates: readonly FeedCandidate[] }
  | {
      readonly type: "FeedUnreachable";
      readonly url: FeedUrl;
      readonly message: string;
      readonly reason?: "network" | "format" | "not-found" | "timeout";
    }
  | { readonly type: "RegistrationUnavailable"; readonly retryAfterSeconds: number | null };

export type RegisterFeedResult = { readonly feed: Feed; readonly created: boolean };
export type RegisterFeed = {
  execute(rawUrl: string): Promise<Result<RegisterFeedResult, RegisterFeedError>>;
};

const REGISTRATION_BUDGET_MS = 45_000;
const MAX_CANDIDATES = 8;
type ReadableFeed = Extract<FetchFeedSuccess, { readonly status: "fetched" }>;
type FoundFeed =
  | { readonly kind: "registered"; readonly feed: Feed }
  | { readonly kind: "fetched"; readonly url: FeedUrl; readonly response: ReadableFeed };

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
function mastodonError(url: FeedUrl): RegisterFeedError {
  const account = new URL(url);
  account.pathname = account.pathname.replace(/\.rss$/i, "");
  account.search = "";
  account.hash = "";
  return { type: "MastodonFeed", accountUrl: account.href };
}
function candidateFor(found: FoundFeed): FeedCandidate {
  if (found.kind === "registered") return {
    url: found.feed.url, title: found.feed.title,
    description: found.feed.description === null ? null : stripHtml(found.feed.description).slice(0, 400),
    recentTitles: [], registered: true,
  };
  const metadata = found.response.feed;
  const recentTitles = metadata.items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (b.item.publishedAt?.getTime() ?? 0) - (a.item.publishedAt?.getTime() ?? 0) || a.index - b.index)
    .flatMap(({ item }) => item.title === null ? [] : [stripHtml(item.title).trim().slice(0, 200)])
    .filter(title => title.length > 0).slice(0, 2);
  return {
    url: found.url, title: titleFrom(metadata.title),
    description: metadata.description === null ? null : stripHtml(metadata.description).slice(0, 400),
    recentTitles, registered: false,
  };
}

/** Discovery is bounded, and never creates actors until a single feed is selected. */
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
      const parsed = FeedUrl.create(rawUrl);
      if (!parsed.ok) return parsed;
      let url = parsed.value;
      const lease = await deps.gate.tryAcquire();
      if (lease === null) return err({ type: "RegistrationUnavailable", retryAfterSeconds: 30 });
      const deadline = deps.clock.now().getTime() + REGISTRATION_BUDGET_MS;
      const remaining = () => Math.max(0, deadline - deps.clock.now().getTime());
      const timedOut = (): Result<never, RegisterFeedError> => err({
        type: "FeedUnreachable", url, message: "feed discovery timed out", reason: "timeout",
      });
      try {
        if (await deps.blockedFeeds?.isBlocked(url)) return err({ type: "FeedBlocked" });
        const registered = await deps.feeds.findByUrl(url);
        if (registered !== null) return ok({ feed: registered, created: false });
        const since = new Date(deps.clock.now().getTime() - 24 * 60 * 60 * 1000);
        const counts = await deps.feeds.registrationCounts(since);
        if (counts.total >= deps.limits.total) return err({ type: "RegistrationUnavailable", retryAfterSeconds: null });
        if (counts.recent >= deps.limits.daily) return err({ type: "RegistrationUnavailable", retryAfterSeconds: 3600 });
        if (remaining() === 0) return timedOut();
        let fetched = await deps.fetcher.fetch(url, NO_VALIDATORS, { timeoutMs: remaining() });
        if (remaining() === 0) return timedOut();
        if (!fetched.ok && fetched.error.type === "InvalidFeedFormat" && deps.discoverer) {
          if (remaining() === 0) return timedOut();
          const discovered = await deps.discoverer.discover(url, { timeoutMs: remaining() });
          if (remaining() === 0) return timedOut();
          if (!discovered.ok) return err({ type: "FeedUnreachable", url, message: discovered.error, reason: "network" });
          const matches: FoundFeed[] = [];
          let blocked = false;
          let mastodon: FeedUrl | null = null;
          let unavailable = false;
          const candidates = [...new Set(discovered.value)].slice(0, MAX_CANDIDATES);
          for (const candidate of candidates) {
            if (remaining() === 0) return timedOut();
            if (await deps.blockedFeeds?.isBlocked(candidate)) { blocked = true; continue; }
            const existing = await deps.feeds.findByUrl(candidate);
            if (existing !== null) { matches.push({ kind: "registered", feed: existing }); continue; }
            if (remaining() === 0) return timedOut();
            const attempt = await deps.fetcher.fetch(candidate, NO_VALIDATORS, { timeoutMs: remaining() });
            if (remaining() === 0) return timedOut();
            if (!attempt.ok) { unavailable ||= attempt.error.type === "RequestFailed"; continue; }
            if (attempt.value.status !== "fetched") continue;
            if (isMastodonAccountFeed(attempt.value.feed.generator ?? null, candidate)) { mastodon = candidate; continue; }
            matches.push({ kind: "fetched", url: candidate, response: attempt.value });
          }
          if (matches.length > 1) {
            return err({ type: "MultipleFeeds", candidates: matches.map(candidateFor) });
          }
          const selected = matches[0];
          if (selected?.kind === "registered") return ok({ feed: selected.feed, created: false });
          if (selected?.kind === "fetched") { url = selected.url; fetched = ok(selected.response); }
          else {
            if (blocked) return err({ type: "FeedBlocked" });
            if (mastodon !== null) return err(mastodonError(mastodon));
            return err({ type: "FeedUnreachable", url, message: "no readable feed found", reason: unavailable ? "network" : "not-found" });
          }
        }
        if (!fetched.ok) return err({ type: "FeedUnreachable", url, message: fetched.error.message,
          reason: fetched.error.type === "RequestFailed" ? "network" : "format" });
        const metadata = fetched.value.status === "fetched" ? fetched.value.feed
          : { title: null, description: null, language: null, generator: null };
        if (isMastodonAccountFeed(metadata.generator ?? null, url)) return err(mastodonError(url));
        const feed = Feed.register({ url, handle: Handle.fromFeedUrl(url), title: titleFrom(metadata.title),
          description: metadata.description, language: languageFrom(metadata.language), now: deps.clock.now() });
        await deps.feeds.save(feed);
        return ok({ feed, created: true });
      } finally { await lease.release(); }
    },
  };
}
