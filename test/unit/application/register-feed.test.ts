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

function setup() {
  const feeds = createInMemoryFeedRepository();
  const fetcher = fakeFetcher();
  const registerFeed = createRegisterFeed({
    feeds,
    fetcher,
    clock: fixedClock(now),
  });
  return { feeds, fetcher, registerFeed };
}

describe("RegisterFeed", () => {
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
  });
});
