import type { PostContent } from "../../src/domain/content/content-policy.js";
import {
  type CacheValidators,
  Feed,
  FeedTitle,
} from "../../src/domain/feed/feed.js";
import type { RawFeedItem } from "../../src/domain/feed/feed-item.js";
import { FeedLanguage } from "../../src/domain/feed/feed-language.js";
import { FeedUrl } from "../../src/domain/feed/feed-url.js";
import { Handle } from "../../src/domain/feed/handle.js";
import { IconUrl } from "../../src/domain/feed/icon-url.js";
import type { Clock } from "../../src/domain/ports/clock.js";
import type {
  ContentExtractor,
  ExtractContentError,
  ExtractedContent,
} from "../../src/domain/ports/content-extractor.js";
import type {
  FaviconResolver,
  ResolveFaviconError,
  ResolvedFavicon,
} from "../../src/domain/ports/favicon-resolver.js";
import type {
  FeedFetcher,
  FetchFeedError,
  FetchFeedSuccess,
} from "../../src/domain/ports/feed-fetcher.js";
import type {
  FederationError,
  FederationGateway,
} from "../../src/domain/ports/federation-gateway.js";
import { err, ok, type Result } from "../../src/shared/result.js";
import { unwrap } from "./result.js";

/**
 * The instant every fixture is registered at. Tests that assert on scheduling
 * (nextPollAt, backoff) must import this rather than declare their own, so the
 * fixture and the clock cannot drift apart.
 */
export const T0 = new Date("2026-07-26T12:00:00.000Z");

/**
 * A registered feed with everything optional. Tests that assert on a field
 * still pass it explicitly; the rest stop restating the constructor.
 *
 * Not used by `test/unit/domain/feed/feed.test.ts` on purpose — `Feed.register`
 * is the subject there, so it must stay visible at the call site.
 */
export function makeFeed(
  params: {
    url?: string;
    handle?: string;
    title?: string | null;
    description?: string | null;
    fullContentEnabled?: boolean;
    iconUrl?: string | null;
    language?: string | null;
    now?: Date;
  } = {},
): Feed {
  const url = unwrap(FeedUrl.create(params.url ?? "https://a.co/f"));
  const rawTitle = params.title ?? null;
  const fullContentEnabled = params.fullContentEnabled ?? false;
  const feed = Feed.register({
    url,
    handle:
      params.handle === undefined
        ? Handle.fromFeedUrl(url, fullContentEnabled)
        : unwrap(Handle.create(params.handle)),
    title: rawTitle === null ? null : unwrap(FeedTitle.create(rawTitle)),
    description: params.description ?? null,
    fullContentEnabled,
    now: params.now ?? T0,
  });
  const iconed =
    params.iconUrl === undefined
      ? feed
      : {
          ...feed,
          iconUrl:
            params.iconUrl === null ? null : unwrap(IconUrl.create(params.iconUrl)),
        };
  if (params.language === undefined) return iconed;
  return {
    ...iconed,
    language:
      params.language === null ? null : unwrap(FeedLanguage.create(params.language)),
  };
}

export function fixedClock(date: Date): Clock {
  return { now: () => date };
}

export function mutableClock(start: Date): Clock & { set(date: Date): void } {
  let current = start;
  return {
    now: () => current,
    set(date: Date) {
      current = date;
    },
  };
}

export const EMPTY_RAW: RawFeedItem = {
  guid: null,
  link: null,
  title: null,
  contentHtml: null,
  summaryHtml: null,
  publishedAt: null,
  language: null,
};

export function rawItem(overrides: Partial<RawFeedItem>): RawFeedItem {
  return { ...EMPTY_RAW, ...overrides };
}

export function fetchedFeed(params: {
  title?: string | null;
  description?: string | null;
  link?: string | null;
  language?: string | null;
  items?: readonly RawFeedItem[];
  validators?: CacheValidators;
}): FetchFeedSuccess {
  return {
    status: "fetched",
    feed: {
      title: params.title ?? null,
      description: params.description ?? null,
      link: params.link ?? null,
      language: params.language ?? null,
      items: params.items ?? [],
    },
    validators: params.validators ?? { etag: null, lastModified: null },
  };
}

export type FakeFetcher = FeedFetcher & {
  respondWith(
    url: string,
    result: Result<FetchFeedSuccess, FetchFeedError>,
  ): void;
  readonly calls: { url: string; validators: CacheValidators }[];
};

export function fakeFetcher(): FakeFetcher {
  const responses = new Map<string, Result<FetchFeedSuccess, FetchFeedError>>();
  const calls: { url: string; validators: CacheValidators }[] = [];
  return {
    calls,
    respondWith(url, result) {
      responses.set(url, result);
    },
    async fetch(url, validators) {
      calls.push({ url, validators });
      return (
        responses.get(url) ??
        err({ type: "RequestFailed", url, message: "no fake response" })
      );
    },
  };
}

export type CapturingFederation = FederationGateway & {
  readonly published: { feed: Feed; content: PostContent }[];
  readonly deletedActors: Feed[];
  failNextPublishesWith(message: string | null): void;
};

export function capturingFederation(): CapturingFederation {
  const published: { feed: Feed; content: PostContent }[] = [];
  const deletedActors: Feed[] = [];
  let failure: string | null = null;
  return {
    published,
    deletedActors,
    failNextPublishesWith(message) {
      failure = message;
    },
    async publish(feed, content): Promise<Result<void, FederationError>> {
      if (failure !== null) {
        return err({
          type: "FederationDeliveryFailed",
          feedId: feed.id,
          message: failure,
        });
      }
      published.push({ feed, content });
      return ok(undefined);
    },
    async deleteActor(feed): Promise<Result<void, FederationError>> {
      deletedActors.push(feed);
      return ok(undefined);
    },
  };
}

export type FakeContentExtractor = ContentExtractor & {
  respondWith(
    url: string,
    result: Result<ExtractedContent, ExtractContentError>,
  ): void;
  readonly calls: string[];
};

/** Fails extraction for any URL with no configured response. */
export function fakeContentExtractor(): FakeContentExtractor {
  const responses = new Map<string, Result<ExtractedContent, ExtractContentError>>();
  const calls: string[] = [];
  return {
    calls,
    respondWith(url, result) {
      responses.set(url, result);
    },
    async extract(url) {
      calls.push(url);
      return (
        responses.get(url) ??
        err({ type: "ExtractionFailed", url, message: "no fake response" })
      );
    },
  };
}

export type FakeFaviconResolver = FaviconResolver & {
  respondWith(
    url: string,
    result: Result<ResolvedFavicon, ResolveFaviconError>,
  ): void;
  readonly calls: string[];
};

/** Reports "not found" for any URL with no configured response. */
export function fakeFaviconResolver(): FakeFaviconResolver {
  const responses = new Map<string, Result<ResolvedFavicon, ResolveFaviconError>>();
  const calls: string[] = [];
  return {
    calls,
    respondWith(url, result) {
      responses.set(url, result);
    },
    async resolve(url) {
      calls.push(url);
      return responses.get(url) ?? err({ type: "NotFound", url });
    },
  };
}
