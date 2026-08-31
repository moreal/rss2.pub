import { describe, expect, it } from "vitest";
import {
  createPollDueFeeds,
  createPollFeed,
} from "../../../src/application/poll-feed.js";
import { ContentPolicy } from "../../../src/domain/content/content-policy.js";
import { AttributionCandidates } from "../../../src/domain/feed/author-uri.js";
import { FeedId } from "../../../src/domain/feed/feed.js";
import { ResolvedActorUri } from "../../../src/domain/ports/actor-resolver.js";
import type { ItemKey } from "../../../src/domain/feed/feed-item.js";
import { PollPolicy } from "../../../src/domain/feed/poll-policy.js";
import { createInMemoryFeedRepository } from "../../../src/infrastructure/persistence/in-memory-feed-repository.js";
import { createInMemoryItemRepository } from "../../../src/infrastructure/persistence/in-memory-item-repository.js";
import { err, ok } from "../../../src/shared/result.js";
import {
  capturingFederation,
  fakeActorResolver,
  fakeContentExtractor,
  fakeFaviconResolver,
  fakeFetcher,
  fetchedFeed,
  makeFeed,
  mutableClock,
  rawItem,
  T0,
} from "../../helpers/fakes.js";
import { unwrap, unwrapErr } from "../../helpers/result.js";

// The fixtures are registered at T0, and the clock starts there.
const now = T0;
const pollPolicy = unwrap(
  PollPolicy.create({ intervalSeconds: 100, maxBackoffSeconds: 400 }),
);

function setup(params: { feedUrl?: string; fullContentEnabled?: boolean } = {}) {
  const feed = makeFeed({
    url: params.feedUrl ?? "https://a.co/f",
    fullContentEnabled: params.fullContentEnabled ?? false,
  });
  const feeds = createInMemoryFeedRepository();
  const items = createInMemoryItemRepository();
  const fetcher = fakeFetcher();
  const federation = capturingFederation();
  const actorResolver = fakeActorResolver();
  const contentExtractor = fakeContentExtractor();
  const faviconResolver = fakeFaviconResolver();
  const clock = mutableClock(now);
  const pollFeed = createPollFeed({
    feeds,
    items,
    fetcher,
    federation,
    actorResolver,
    contentExtractor,
    faviconResolver,
    clock,
    pollPolicy,
    contentPolicy: ContentPolicy.DEFAULT,
  });
  return {
    url: feed.url,
    feed,
    feeds,
    items,
    fetcher,
    federation,
    actorResolver,
    contentExtractor,
    faviconResolver,
    clock,
    pollFeed,
  };
}

describe("PollFeed", () => {
  it("fails on unknown feeds", async () => {
    const { pollFeed } = setup();
    const missing = "0".repeat(64);
    const error = unwrapErr(await pollFeed.execute(unwrap(FeedId.create(missing))));
    expect(error).toMatchObject({ type: "FeedNotFound" });
  });

  it("backs off after a fetch failure", async () => {
    const { feed, feeds, fetcher, pollFeed } = setup();
    await feeds.save(feed);
    fetcher.respondWith(
      feed.url,
      err({ type: "RequestFailed", url: feed.url, message: "timeout" }),
    );

    const report = unwrap(await pollFeed.execute(feed.id));
    expect(report).toMatchObject({ status: "fetch-failed", fetchError: "timeout" });

    const saved = await feeds.findById(feed.id);
    expect(saved?.consecutiveFailures).toBe(1);
    expect(saved?.nextPollAt).toEqual(new Date(now.getTime() + 200_000));
  });

  it("publishes only new items, oldest first, and remembers them", async () => {
    const { feed, feeds, fetcher, federation, pollFeed } = setup();
    await feeds.save(feed);
    const response = ok(
      fetchedFeed({
        title: "Titled Feed",
        description: "desc",
        validators: { etag: 'W/"v1"', lastModified: null },
        items: [
          rawItem({
            guid: "b",
            title: "newest",
            publishedAt: new Date("2026-07-02T00:00:00Z"),
          }),
          rawItem({
            guid: "a",
            title: "oldest",
            publishedAt: new Date("2026-07-01T00:00:00Z"),
          }),
        ],
      }),
    );
    fetcher.respondWith(feed.url, response);

    const report = unwrap(await pollFeed.execute(feed.id));
    expect(report).toMatchObject({ status: "polled", published: 2 });
    expect(
      federation.published.map(({ content }) =>
        content.kind === "note" ? content.title : content.name,
      ),
    ).toEqual(["oldest", "newest"]);

    const saved = await feeds.findById(feed.id);
    expect(saved?.title).toBe("Titled Feed");
    expect(saved?.description).toBe("desc");
    expect(saved?.validators).toEqual({ etag: 'W/"v1"', lastModified: null });
    expect(saved?.nextPollAt).toEqual(new Date(now.getTime() + 100_000));

    const second = unwrap(await pollFeed.execute(feed.id));
    expect(second.published).toBe(0);
    expect(second.updated).toBe(0);
    expect(federation.published).toHaveLength(2);
  });

  it("passes stored validators and honors not-modified", async () => {
    const { feed, feeds, fetcher, federation, pollFeed } = setup();
    const validators = { etag: 'W/"v1"', lastModified: null };
    await feeds.save({ ...feed, validators });
    fetcher.respondWith(feed.url, ok({ status: "not-modified" }));

    const report = unwrap(await pollFeed.execute(feed.id));
    expect(report).toMatchObject({ status: "not-modified", published: 0 });
    expect(fetcher.calls[0]?.validators).toEqual(validators);
    expect(federation.published).toHaveLength(0);

    const saved = await feeds.findById(feed.id);
    expect(saved?.validators).toEqual(validators);
    expect(saved?.nextPollAt).toEqual(new Date(now.getTime() + 100_000));
  });

  it("retries items whose publish failed, without duplicating successes", async () => {
    const { feed, feeds, fetcher, federation, pollFeed } = setup();
    await feeds.save(feed);
    fetcher.respondWith(
      feed.url,
      ok(fetchedFeed({ items: [rawItem({ guid: "x", title: "post" })] })),
    );

    federation.failNextPublishesWith("inbox unreachable");
    const failed = unwrap(await pollFeed.execute(feed.id));
    expect(failed).toMatchObject({ status: "polled", published: 0 });
    expect(failed.publishErrors).toEqual(["inbox unreachable"]);

    federation.failNextPublishesWith(null);
    const retried = unwrap(await pollFeed.execute(feed.id));
    expect(retried.published).toBe(1);
    expect(federation.published).toHaveLength(1);
    expect(federation.publishAttempts.map((attempt) => attempt.itemKey)).toEqual([
      "guid:x",
      "guid:x",
    ]);
  });

  it("collapses duplicate keys within one fetch and skips unidentifiable items", async () => {
    const { feed, feeds, fetcher, federation, pollFeed } = setup();
    await feeds.save(feed);
    fetcher.respondWith(
      feed.url,
      ok(
        fetchedFeed({
          items: [
            rawItem({ guid: "dup", title: "first copy" }),
            rawItem({ guid: "dup", title: "second copy" }),
            rawItem({}), // nothing to identify it by
          ],
        }),
      ),
    );

    const report = unwrap(await pollFeed.execute(feed.id));
    expect(report.published).toBe(1);
    expect(federation.published).toHaveLength(1);
  });

  it("leaves content untouched for feeds without full-content mode", async () => {
    const { feed, feeds, fetcher, federation, contentExtractor, pollFeed } = setup();
    await feeds.save(feed);
    fetcher.respondWith(
      feed.url,
      ok(
        fetchedFeed({
          items: [
            rawItem({
              guid: "x",
              title: "post",
              link: "https://a.co/x",
              contentHtml: "<p>teaser</p>",
            }),
          ],
        }),
      ),
    );

    await pollFeed.execute(feed.id);
    expect(contentExtractor.calls).toHaveLength(0);
    const [published] = federation.published;
    expect(published?.content.kind === "note" && published.content.bodyHtml).toBe(
      "<p>teaser</p>",
    );
  });

  it("replaces the teaser with extracted content for full-content feeds (ADR-0009)", async () => {
    const { feed, feeds, fetcher, federation, contentExtractor, pollFeed } = setup({
      fullContentEnabled: true,
    });
    await feeds.save(feed);
    fetcher.respondWith(
      feed.url,
      ok(
        fetchedFeed({
          items: [
            rawItem({
              guid: "x",
              title: "post",
              link: "https://a.co/x",
              contentHtml: "<p>teaser</p>",
            }),
          ],
        }),
      ),
    );
    contentExtractor.respondWith(
      "https://a.co/x",
      ok({ contentHtml: "<p>the full article</p>" }),
    );

    await pollFeed.execute(feed.id);
    expect(contentExtractor.calls).toEqual(["https://a.co/x"]);
    const [published] = federation.published;
    expect(published?.content.kind === "note" && published.content.bodyHtml).toBe(
      "<p>the full article</p>",
    );
  });

  it("falls back to the teaser when extraction fails for a full-content feed", async () => {
    const { feed, feeds, fetcher, federation, contentExtractor, pollFeed } = setup({
      fullContentEnabled: true,
    });
    await feeds.save(feed);
    fetcher.respondWith(
      feed.url,
      ok(
        fetchedFeed({
          items: [
            rawItem({
              guid: "x",
              title: "post",
              link: "https://a.co/x",
              contentHtml: "<p>teaser</p>",
            }),
          ],
        }),
      ),
    );
    contentExtractor.respondWith(
      "https://a.co/x",
      err({ type: "RequestFailed", url: "https://a.co/x", message: "timeout" }),
    );

    const report = unwrap(await pollFeed.execute(feed.id));
    expect(report.published).toBe(1);
    const [published] = federation.published;
    expect(published?.content.kind === "note" && published.content.bodyHtml).toBe(
      "<p>teaser</p>",
    );
  });
});

describe("PollFeed author attribution", () => {
  const resolved = (raw: string) => unwrap(ResolvedActorUri.create(raw));
  const candidate = (raw: string) => {
    const value = AttributionCandidates.values(
      AttributionCandidates.fromRaw([raw]),
    )[0];
    if (value === undefined) throw new Error(`invalid author URI: ${raw}`);
    return value;
  };

  it("memoizes a shared author once within one poll", async () => {
    const { feed, feeds, fetcher, federation, actorResolver, pollFeed } = setup();
    await feeds.save(feed);
    const author = "https://actors.test/alice";
    actorResolver.respondWith(author, ok(resolved(author)));
    fetcher.respondWith(
      feed.url,
      ok(fetchedFeed({
        items: [
          rawItem({ guid: "a", title: "A", authorUris: [author] }),
          rawItem({ guid: "b", title: "B", authorUris: [author] }),
        ],
      })),
    );

    const report = unwrap(await pollFeed.execute(feed.id));

    expect(report).toMatchObject({ status: "polled", published: 2 });
    expect(actorResolver.calls).toEqual([author]);
    expect(federation.published.map((post) => post.additionalAttributions))
      .toEqual([[author], [author]]);
  });

  it("preserves successful order while isolating failures and non-Actors", async () => {
    const { feed, feeds, fetcher, federation, actorResolver, pollFeed } = setup();
    await feeds.save(feed);
    const a = "https://actors.test/a";
    const b = "https://actors.test/b";
    const c = "https://actors.test/c";
    const d = "https://actors.test/d";
    actorResolver.respondWith(a, ok(resolved(a)));
    actorResolver.respondWith(b, err({
      type: "ActorLookupFailed",
      uri: candidate(b),
      message: "lookup B failed",
    }));
    actorResolver.respondWith(c, ok(null));
    actorResolver.respondWith(d, ok(resolved(d)));
    fetcher.respondWith(
      feed.url,
      ok(fetchedFeed({
        items: [rawItem({
          guid: "x",
          title: "post",
          authorUris: [a, b, c, d],
        })],
      })),
    );

    const report = unwrap(await pollFeed.execute(feed.id));

    expect(report).toMatchObject({
      status: "polled",
      published: 1,
      publishErrors: [],
      attributionErrors: ["lookup B failed"],
    });
    expect(federation.published[0]?.additionalAttributions).toEqual([a, d]);
  });

  it("does no lookup for an unchanged item", async () => {
    const { feed, feeds, fetcher, actorResolver, pollFeed } = setup();
    await feeds.save(feed);
    const author = "https://actors.test/alice";
    actorResolver.respondWith(author, ok(resolved(author)));
    const response = ok(fetchedFeed({
      items: [rawItem({ guid: "x", title: "same", authorUris: [author] })],
    }));
    fetcher.respondWith(feed.url, response);
    await pollFeed.execute(feed.id);
    actorResolver.clearCalls();

    const report = unwrap(await pollFeed.execute(feed.id));

    expect(report).toMatchObject({ published: 0, updated: 0 });
    expect(actorResolver.calls).toEqual([]);
  });

  it("updates for an author-only change and resolves the new author", async () => {
    const { feed, feeds, fetcher, federation, actorResolver, pollFeed } = setup();
    await feeds.save(feed);
    const a = "https://actors.test/a";
    const b = "https://actors.test/b";
    actorResolver.respondWith(a, ok(resolved(a)));
    actorResolver.respondWith(b, ok(resolved(b)));
    fetcher.respondWith(feed.url, ok(fetchedFeed({
      items: [rawItem({ guid: "x", title: "same", authorUris: [a] })],
    })));
    await pollFeed.execute(feed.id);
    actorResolver.clearCalls();
    fetcher.respondWith(feed.url, ok(fetchedFeed({
      items: [rawItem({ guid: "x", title: "same", authorUris: [b] })],
    })));

    const report = unwrap(await pollFeed.execute(feed.id));

    expect(report).toMatchObject({ published: 0, updated: 1 });
    expect(actorResolver.calls).toEqual([b]);
    expect(federation.updated[0]?.additionalAttributions).toEqual([b]);
  });

  it("still updates when author lookup fails", async () => {
    const { feed, feeds, fetcher, federation, actorResolver, pollFeed } = setup();
    await feeds.save(feed);
    fetcher.respondWith(feed.url, ok(fetchedFeed({
      items: [rawItem({ guid: "x", title: "v1" })],
    })));
    await pollFeed.execute(feed.id);
    const author = "https://actors.test/failing";
    actorResolver.respondWith(author, err({
      type: "ActorLookupFailed",
      uri: candidate(author),
      message: "author unavailable",
    }));
    fetcher.respondWith(feed.url, ok(fetchedFeed({
      items: [rawItem({ guid: "x", title: "v1", authorUris: [author] })],
    })));

    const report = unwrap(await pollFeed.execute(feed.id));

    expect(report).toMatchObject({
      status: "polled",
      updated: 1,
      publishErrors: [],
      attributionErrors: ["author unavailable"],
    });
    expect(federation.updated[0]?.additionalAttributions).toEqual([]);
  });
});

describe("PollFeed icon resolution (ADR-0010)", () => {
  it("resolves the actor icon from the channel link on the first poll", async () => {
    const { feed, feeds, fetcher, faviconResolver, pollFeed } = setup();
    await feeds.save(feed);
    fetcher.respondWith(
      feed.url,
      ok(fetchedFeed({ link: "https://a.co/" })),
    );
    faviconResolver.respondWith(
      "https://a.co/",
      ok({ iconUrl: "https://a.co/favicon.ico" }),
    );

    await pollFeed.execute(feed.id);
    expect(faviconResolver.calls).toEqual(["https://a.co/"]);
    const saved = await feeds.findById(feed.id);
    expect(saved?.iconUrl).toBe("https://a.co/favicon.ico");
  });

  it("never re-fetches once an icon is already set", async () => {
    const { feeds, fetcher, faviconResolver, pollFeed } = setup();
    const feed = makeFeed({ iconUrl: "https://a.co/existing-icon.png" });
    await feeds.save(feed);
    fetcher.respondWith(feed.url, ok(fetchedFeed({ link: "https://a.co/" })));

    await pollFeed.execute(feed.id);
    expect(faviconResolver.calls).toHaveLength(0);
    const saved = await feeds.findById(feed.id);
    expect(saved?.iconUrl).toBe("https://a.co/existing-icon.png");
  });

  it("leaves the icon null when the channel link is missing or resolution fails", async () => {
    const { feed, feeds, fetcher, faviconResolver, pollFeed } = setup();
    await feeds.save(feed);
    fetcher.respondWith(feed.url, ok(fetchedFeed({ link: null })));

    await pollFeed.execute(feed.id);
    expect(faviconResolver.calls).toHaveLength(0);
    expect((await feeds.findById(feed.id))?.iconUrl).toBeNull();
  });

  it("does not fail the poll when favicon resolution errors", async () => {
    const { feed, feeds, fetcher, federation, faviconResolver, pollFeed } = setup();
    await feeds.save(feed);
    fetcher.respondWith(
      feed.url,
      ok(
        fetchedFeed({
          link: "https://a.co/",
          items: [rawItem({ guid: "x", title: "post" })],
        }),
      ),
    );
    faviconResolver.respondWith(
      "https://a.co/",
      err({ type: "NotFound", url: "https://a.co/" }),
    );

    const report = unwrap(await pollFeed.execute(feed.id));
    expect(report).toMatchObject({ status: "polled", published: 1 });
    expect(federation.published).toHaveLength(1);
    expect((await feeds.findById(feed.id))?.iconUrl).toBeNull();
  });
});

describe("PollFeed language (ADR-0011)", () => {
  it("refreshes the feed language and publishes the parser's effective item language", async () => {
    const { feed, feeds, fetcher, federation, pollFeed } = setup();
    await feeds.save(feed);
    fetcher.respondWith(
      feed.url,
      ok(
        fetchedFeed({
          language: "ko",
          items: [rawItem({ guid: "x", title: "post", language: "ko" })],
        }),
      ),
    );

    await pollFeed.execute(feed.id);
    expect((await feeds.findById(feed.id))?.language).toBe("ko");
    expect(federation.published[0]?.content.language).toBe("ko");
  });

  it("keeps an explicit empty entry language override untagged", async () => {
    const { feed, feeds, fetcher, federation, pollFeed } = setup();
    await feeds.save(feed);
    fetcher.respondWith(
      feed.url,
      ok(
        fetchedFeed({
          language: "en",
          items: [rawItem({ guid: "x", title: "post", language: null })],
        }),
      ),
    );

    await pollFeed.execute(feed.id);

    expect((await feeds.findById(feed.id))?.language).toBe("en");
    expect(federation.published[0]?.content.language).toBeNull();
  });

  it("prefers an item's own language over the feed's", async () => {
    const { feed, feeds, fetcher, federation, pollFeed } = setup();
    await feeds.save(feed);
    fetcher.respondWith(
      feed.url,
      ok(
        fetchedFeed({
          language: "en",
          items: [rawItem({ guid: "x", title: "post", language: "ja" })],
        }),
      ),
    );

    await pollFeed.execute(feed.id);
    expect(federation.published[0]?.content.language).toBe("ja");
  });

  it("keeps the existing language when a poll offers none", async () => {
    const { feeds, fetcher, pollFeed } = setup();
    const feed = makeFeed({ language: "ko" });
    await feeds.save(feed);
    fetcher.respondWith(feed.url, ok(fetchedFeed({})));

    await pollFeed.execute(feed.id);
    expect((await feeds.findById(feed.id))?.language).toBe("ko");
  });
});

describe("PollFeed content updates", () => {
  it("publishes an Update when a previously-published item's content changes", async () => {
    const { feed, feeds, fetcher, federation, pollFeed } = setup();
    await feeds.save(feed);
    fetcher.respondWith(
      feed.url,
      ok(fetchedFeed({ items: [rawItem({ guid: "x", title: "v1" })] })),
    );
    const first = unwrap(await pollFeed.execute(feed.id));
    expect(first).toMatchObject({ published: 1, updated: 0 });
    const messageUri = federation.published[0]?.messageUri;

    fetcher.respondWith(
      feed.url,
      ok(fetchedFeed({ items: [rawItem({ guid: "x", title: "v2" })] })),
    );
    const second = unwrap(await pollFeed.execute(feed.id));
    expect(second).toMatchObject({ published: 0, updated: 1, publishErrors: [] });
    expect(federation.published).toHaveLength(1);
    expect(federation.updated).toHaveLength(1);
    expect(federation.updated[0]?.messageUri).toBe(messageUri);
    const content = federation.updated[0]?.content;
    expect(content?.kind === "note" && content.title).toBe("v2");
  });

  it("retries a failed update without losing the pending change", async () => {
    const { feed, feeds, fetcher, federation, pollFeed } = setup();
    await feeds.save(feed);
    fetcher.respondWith(
      feed.url,
      ok(fetchedFeed({ items: [rawItem({ guid: "x", title: "v1" })] })),
    );
    await pollFeed.execute(feed.id);

    fetcher.respondWith(
      feed.url,
      ok(fetchedFeed({ items: [rawItem({ guid: "x", title: "v2" })] })),
    );
    federation.failNextUpdatesWith("inbox unreachable");
    const failed = unwrap(await pollFeed.execute(feed.id));
    expect(failed).toMatchObject({ updated: 0, publishErrors: ["inbox unreachable"] });

    federation.failNextUpdatesWith(null);
    const retried = unwrap(await pollFeed.execute(feed.id));
    expect(retried.updated).toBe(1);
    expect(federation.updated).toHaveLength(1);
  });

  it("does not fire an Update for a pre-migration row with no stored message URI", async () => {
    const { feed, feeds, items, fetcher, federation, pollFeed } = setup();
    await feeds.save(feed);
    await items.markPublished(feed.id, [
      {
        key: "guid:x" as ItemKey,
        publishedAt: T0,
        contentFingerprint: "stale-fingerprint-from-before-this-feature",
        messageUri: null,
      },
    ]);
    fetcher.respondWith(
      feed.url,
      ok(fetchedFeed({ items: [rawItem({ guid: "x", title: "v1" })] })),
    );

    const first = unwrap(await pollFeed.execute(feed.id));
    expect(first).toMatchObject({ published: 0, updated: 0 });
    expect(federation.published).toHaveLength(0);
    expect(federation.updated).toHaveLength(0);

    // Fingerprint is now backfilled, so an unchanged re-poll stays quiet.
    const second = unwrap(await pollFeed.execute(feed.id));
    expect(second).toMatchObject({ published: 0, updated: 0 });
    expect(federation.updated).toHaveLength(0);
  });
});

describe("PollDueFeeds", () => {
  it("polls due feeds only", async () => {
    const { feed, feeds, fetcher, clock, pollFeed } = setup();
    await feeds.save(feed);

    const other = makeFeed({ url: "https://b.co/f" });
    await feeds.save({ ...other, nextPollAt: new Date(now.getTime() + 60_000) });

    fetcher.respondWith(feed.url, ok(fetchedFeed({})));

    const pollDueFeeds = createPollDueFeeds({ feeds, pollFeed, clock });
    const reports = await pollDueFeeds.execute();
    expect(reports).toHaveLength(1);
    expect(reports[0]?.feedId).toBe(feed.id);
  });
});
