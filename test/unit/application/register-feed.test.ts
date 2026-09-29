import { describe, expect, it } from "vitest";
import { createRegisterFeed } from "../../../src/application/register-feed.js";
import { createInMemoryFeedRepository } from "../../../src/infrastructure/persistence/in-memory-feed-repository.js";
import {
  fakeFetcher,
  fetchedFeed,
  fixedClock,
} from "../../helpers/fakes.js";
import { unwrap, unwrapErr } from "../../helpers/result.js";
import { err, ok } from "../../../src/shared/result.js";
import { FeedUrl } from "../../../src/domain/feed/feed-url.js";

const now = new Date("2026-07-26T12:00:00Z");

function setup(limits = { daily: 20, total: 1000 }) {
  const feeds = createInMemoryFeedRepository();
  const fetcher = fakeFetcher();
  const gate = { tryAcquire: async () => ({ release: async () => {} }) };
  const registerFeed = createRegisterFeed({
    feeds,
    fetcher,
    clock: fixedClock(now),
    gate,
    limits,
  });
  return { feeds, fetcher, registerFeed };
}

describe("RegisterFeed", () => {
  it("registers a Mastodon hashtag RSS because the hashtag is not an actor", async () => {
    const { registerFeed, fetcher } = setup();
    const url = "https://social.example/tags/cats.rss";
    fetcher.respondWith(url, ok(fetchedFeed({ generator: "Mastodon v4.4.0" })));
    expect(unwrap(await registerFeed.execute(url)).feed.url).toBe(url);
  });

  it("registers a Mastodon account-filtered hashtag RSS", async () => {
    const { registerFeed, fetcher } = setup();
    const url = "https://social.example/@alice/tagged/cats.rss";
    fetcher.respondWith(url, ok(fetchedFeed({ generator: "Mastodon v4.4.0" })));
    expect(unwrap(await registerFeed.execute(url)).feed.url).toBe(url);
  });

  it("rejects a Mastodon account RSS without registering a duplicate actor", async () => {
    const { feeds, registerFeed, fetcher } = setup();
    const url = "https://social.example/@alice.rss";
    fetcher.respondWith(url, ok(fetchedFeed({ generator: "Mastodon 4.3" })));
    expect(unwrapErr(await registerFeed.execute(url)))
      .toMatchObject({ type: "MastodonFeed" });
    expect(await feeds.findByUrl(unwrap(FeedUrl.create(url)))).toBeNull();
  });

  it("discovers a feed from a website URL and registers the feed URL", async () => {
    const feeds = createInMemoryFeedRepository();
    const fetcher = fakeFetcher();
    const site = unwrap(FeedUrl.create("https://a.co/"));
    const feedUrl = unwrap(FeedUrl.create("https://a.co/feed.xml"));
    fetcher.respondWith(site, err({ type: "InvalidFeedFormat", url: site, message: "HTML" }));
    fetcher.respondWith(feedUrl, ok(fetchedFeed({ title: "Found feed" })));
    const registerFeed = createRegisterFeed({
      feeds,
      fetcher,
      discoverer: { discover: async () => ok([feedUrl]) },
      clock: fixedClock(now),
      gate: { tryAcquire: async () => ({ release: async () => {} }) },
      limits: { daily: 20, total: 1000 },
    });

    const { feed } = unwrap(await registerFeed.execute(site));
    expect(feed.url).toBe(feedUrl);
    expect(feed.title).toBe("Found feed");
  });

  it("rejects a blocked feed before fetching it", async () => {
    const feeds = createInMemoryFeedRepository();
    const fetcher = fakeFetcher();
    const blocked = unwrap(FeedUrl.create("https://a.co/f"));
    const registerFeed = createRegisterFeed({
      feeds,
      fetcher,
      blockedFeeds: { isBlocked: async (url) => url === blocked },
      clock: fixedClock(now),
      gate: { tryAcquire: async () => ({ release: async () => {} }) },
      limits: { daily: 20, total: 1000 },
    });
    expect(unwrapErr(await registerFeed.execute(blocked))).toMatchObject({ type: "FeedBlocked" });
    expect(fetcher.calls).toHaveLength(0);
  });

  it("does not register a blocked feed discovered from a website", async () => {
    const feeds = createInMemoryFeedRepository();
    const fetcher = fakeFetcher();
    const site = unwrap(FeedUrl.create("https://a.co/"));
    const blocked = unwrap(FeedUrl.create("https://a.co/feed.xml"));
    fetcher.respondWith(site, err({ type: "InvalidFeedFormat", url: site, message: "HTML" }));
    const registerFeed = createRegisterFeed({
      feeds, fetcher,
      discoverer: { discover: async () => ok([blocked]) },
      blockedFeeds: { isBlocked: async (url) => url === blocked },
      clock: fixedClock(now),
      gate: { tryAcquire: async () => ({ release: async () => {} }) },
      limits: { daily: 20, total: 1000 },
    });
    expect(unwrapErr(await registerFeed.execute(site))).toMatchObject({ type: "FeedBlocked" });
    expect(fetcher.calls.map((call) => call.url)).toEqual([site]);
  });
  it("rejects a new feed when registration work is already in progress", async () => {
    const feeds = createInMemoryFeedRepository();
    const fetcher = fakeFetcher();
    const registerFeed = createRegisterFeed({
      feeds,
      fetcher,
      clock: fixedClock(now),
      gate: { tryAcquire: async () => null },
      limits: { daily: 20, total: 1000 },
    });
    expect(unwrapErr(await registerFeed.execute("https://a.co/f")))
      .toMatchObject({ type: "RegistrationUnavailable" });
    expect(fetcher.calls).toHaveLength(0);
  });

  it("bounds repeated registration requests before a database lookup", async () => {
    const feeds = createInMemoryFeedRepository();
    const fetcher = fakeFetcher();
    fetcher.respondWith("https://a.co/f", ok(fetchedFeed({})));
    let attempts = 0;
    const registerFeed = createRegisterFeed({
      feeds,
      fetcher,
      clock: fixedClock(now),
      gate: { tryAcquire: async () => ++attempts === 1 ? { release: async () => {} } : null },
      limits: { daily: 20, total: 1000 },
    });
    unwrap(await registerFeed.execute("https://a.co/f"));
    expect(unwrapErr(await registerFeed.execute("https://a.co/f")))
      .toMatchObject({ type: "RegistrationUnavailable" });
  });

  it("caps total new feeds while leaving existing feeds readable", async () => {
    const { registerFeed, fetcher } = setup({ daily: 20, total: 1 });
    fetcher.respondWith("https://a.co/f", ok(fetchedFeed({})));
    unwrap(await registerFeed.execute("https://a.co/f"));
    expect(unwrapErr(await registerFeed.execute("https://b.co/f")))
      .toMatchObject({ type: "RegistrationUnavailable", retryAfterSeconds: null });
    expect(unwrap(await registerFeed.execute("https://a.co/f")).created).toBe(false);
    expect(fetcher.calls).toHaveLength(1);
  });

  it("caps new feeds in the last 24 hours", async () => {
    const { registerFeed, fetcher } = setup({ daily: 1, total: 1000 });
    fetcher.respondWith("https://a.co/f", ok(fetchedFeed({})));
    unwrap(await registerFeed.execute("https://a.co/f"));
    expect(unwrapErr(await registerFeed.execute("https://b.co/f")))
      .toMatchObject({ type: "RegistrationUnavailable", retryAfterSeconds: 3600 });
    expect(fetcher.calls).toHaveLength(1);
  });

  it("releases its registration permit after a failed fetch", async () => {
    const feeds = createInMemoryFeedRepository();
    const fetcher = fakeFetcher();
    let releases = 0;
    const registerFeed = createRegisterFeed({
      feeds,
      fetcher,
      clock: fixedClock(now),
      gate: { tryAcquire: async () => ({ release: async () => { releases++; } }) },
      limits: { daily: 20, total: 1000 },
    });
    await registerFeed.execute("https://a.co/f");
    expect(releases).toBe(1);
  });

  it("rejects unparseable URLs without touching the network", async () => {
    const { fetcher, registerFeed } = setup();
    const error = unwrapErr(await registerFeed.execute("not a url"));
    expect(error).toMatchObject({ type: "NotAUrl" });
    expect(fetcher.calls).toHaveLength(0);
  });

  it("fails when the URL does not serve a readable feed, saving nothing", async () => {
    const { feeds, fetcher, registerFeed } = setup();
    fetcher.respondWith(
      "https://a.co/f",
      err({
        type: "InvalidFeedFormat",
        url: unwrap(FeedUrl.create("https://a.co/f")),
        message: "not xml",
      }),
    );
    const error = unwrapErr(await registerFeed.execute("https://a.co/f"));
    expect(error).toMatchObject({ type: "FeedUnreachable", message: "not xml" });
    expect(await feeds.findByUrl(unwrap(FeedUrl.create("https://a.co/f")))).toBeNull();
  });

  it("registers a reachable feed with metadata from the initial fetch", async () => {
    const { feeds, registerFeed, fetcher } = setup();
    fetcher.respondWith(
      "https://a.co/f",
      ok(fetchedFeed({ title: "My Blog", description: "about things" })),
    );
    const { feed, created } = unwrap(await registerFeed.execute("https://a.co/f"));
    expect(created).toBe(true);
    expect(feed.handle).toMatch(/^a_co_f_[a-z0-9]{7}$/);
    expect(feed.title).toBe("My Blog");
    expect(feed.description).toBe("about things");
    expect(feed.registeredAt).toEqual(now);
    expect(await feeds.findById(feed.id)).toEqual(feed);
  });

  it("is idempotent: re-registering returns the existing feed without refetching", async () => {
    const { registerFeed, fetcher } = setup();
    fetcher.respondWith("https://a.co/f", ok(fetchedFeed({})));
    const first = unwrap(await registerFeed.execute("https://a.co/f"));
    const second = unwrap(await registerFeed.execute("https://a.co/f"));
    expect(second.created).toBe(false);
    expect(second.feed.id).toBe(first.feed.id);
    expect(fetcher.calls).toHaveLength(1);
  });

  it("normalizes URL variants onto one registration", async () => {
    const { registerFeed, fetcher } = setup();
    fetcher.respondWith("https://a.co/f", ok(fetchedFeed({})));
    const first = unwrap(await registerFeed.execute("HTTPS://A.CO:443/f#x"));
    const second = unwrap(await registerFeed.execute("https://a.co/f"));
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
  });

  it("never collides the handle for feeds that normalize to the same stem", async () => {
    const { registerFeed, fetcher } = setup();
    fetcher.respondWith("https://a-b.com/rss", ok(fetchedFeed({})));
    fetcher.respondWith("https://a.b.com/rss", ok(fetchedFeed({})));

    const dashed = unwrap(await registerFeed.execute("https://a-b.com/rss"));
    const dotted = unwrap(await registerFeed.execute("https://a.b.com/rss"));

    expect(dashed.feed.handle).toMatch(/^a_b_com_rss_[a-z0-9]{7}$/);
    expect(dotted.feed.handle).toMatch(/^a_b_com_rss_[a-z0-9]{7}$/);
    expect(dotted.feed.handle).not.toBe(dashed.feed.handle);
    expect(dotted.created).toBe(true);
  });

  it("registers with empty metadata when the server answers not-modified", async () => {
    const { registerFeed, fetcher } = setup();
    fetcher.respondWith("https://a.co/f", ok({ status: "not-modified" }));
    const { feed, created } = unwrap(await registerFeed.execute("https://a.co/f"));
    expect(created).toBe(true);
    expect(feed.title).toBeNull();
    expect(feed.description).toBeNull();
    expect(feed.language).toBeNull();
  });

  it("sets the language from the initial fetch (ADR-0011)", async () => {
    const { registerFeed, fetcher } = setup();
    fetcher.respondWith("https://a.co/f", ok(fetchedFeed({ language: "ko" })));
    const { feed } = unwrap(await registerFeed.execute("https://a.co/f"));
    expect(feed.language).toBe("ko");
  });

  it("drops a malformed language tag rather than failing registration", async () => {
    const { registerFeed, fetcher } = setup();
    fetcher.respondWith(
      "https://a.co/f",
      ok(fetchedFeed({ language: "not a lang" })),
    );
    const { feed } = unwrap(await registerFeed.execute("https://a.co/f"));
    expect(feed.language).toBeNull();
  });
});
