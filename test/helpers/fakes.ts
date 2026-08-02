import type { PostContent } from "../../src/domain/content/content-policy.js";
import type { CacheValidators, Feed } from "../../src/domain/feed/feed.js";
import type { RawFeedItem } from "../../src/domain/feed/feed-item.js";
import type { Clock } from "../../src/domain/ports/clock.js";
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
};

export function rawItem(overrides: Partial<RawFeedItem>): RawFeedItem {
  return { ...EMPTY_RAW, ...overrides };
}

export function fetchedFeed(params: {
  title?: string | null;
  description?: string | null;
  items?: readonly RawFeedItem[];
  validators?: CacheValidators;
}): FetchFeedSuccess {
  return {
    status: "fetched",
    feed: {
      title: params.title ?? null,
      description: params.description ?? null,
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
