import { describe, expect, it } from "vitest";
import { createRegisterFeed } from "../../../src/application/register-feed.js";
import { FeedUrl } from "../../../src/domain/feed/feed-url.js";
import { createInMemoryFeedRepository } from "../../../src/infrastructure/persistence/in-memory-feed-repository.js";
import { err, ok } from "../../../src/shared/result.js";
import { fakeFetcher, fetchedFeed, mutableClock, rawItem } from "../../helpers/fakes.js";
import { unwrap, unwrapErr } from "../../helpers/result.js";

const now = new Date("2026-10-02T09:00:00Z");
const site = unwrap(FeedUrl.create("https://example.com/"));
const posts = unwrap(FeedUrl.create("https://example.com/posts.xml"));
const comments = unwrap(FeedUrl.create("https://example.com/comments.xml"));
function setup(candidates = [posts, comments]) {
  const feeds = createInMemoryFeedRepository();
  const fetcher = fakeFetcher();
  const clock = mutableClock(now);
  let releases = 0;
  fetcher.respondWith(site, err({ type: "InvalidFeedFormat", url: site, message: "HTML" }));
  fetcher.respondWith(posts, ok(fetchedFeed({ title: "Posts", items: [rawItem({ title: "Latest article" })] })));
  fetcher.respondWith(comments, ok(fetchedFeed({ title: "Comments" })));
  const register = createRegisterFeed({
    feeds, fetcher, clock, discoverer: { discover: async () => ok(candidates) },
    gate: { tryAcquire: async () => ({ release: async () => { releases++; } }) },
    limits: { daily: 20, total: 1000 },
  });
  return { feeds, fetcher, clock, register, releases: () => releases };
}
describe("website feed selection", () => {
  it("asks for a choice before creating any actor when several feeds work", async () => {
    const { feeds, register, releases } = setup();
    const result = unwrapErr(await register.execute(site));
    expect(result).toMatchObject({ type: "MultipleFeeds", candidates: [
      { url: posts, title: "Posts", recentTitles: ["Latest article"] },
      { url: comments, title: "Comments", recentTitles: [] },
    ] });
    expect(await feeds.registrationCounts(now)).toEqual({ total: 0, recent: 0 });
    expect(releases()).toBe(1);
    expect(unwrap(await register.execute(comments)).feed.url).toBe(comments);
  });
  it("deduplicates candidates and still auto-registers a single valid feed", async () => {
    const { fetcher, register } = setup([posts, posts, comments]);
    fetcher.respondWith(comments, err({ type: "RequestFailed", url: comments, message: "HTTP 404" }));
    expect(unwrap(await register.execute(site)).feed.url).toBe(posts);
    expect(fetcher.calls.map(call => call.url)).toEqual([site, posts, comments]);
  });
  it("does not offer blocked feeds as choices", async () => {
    const { feeds, fetcher, clock } = setup();
    const register = createRegisterFeed({
      feeds, fetcher, clock, discoverer: { discover: async () => ok([posts, comments]) },
      blockedFeeds: { isBlocked: async url => url === comments },
      gate: { tryAcquire: async () => ({ release: async () => {} }) },
      limits: { daily: 20, total: 1000 },
    });
    expect(unwrap(await register.execute(site)).feed.url).toBe(posts);
    expect(fetcher.calls.map(call => call.url)).toEqual([site, posts]);
  });
  it("stops discovery within the total request budget without silently choosing a partial result", async () => {
    const { feeds, fetcher, clock } = setup();
    const register = createRegisterFeed({
      feeds, clock, fetcher: { fetch: async (url, validators) => {
        if (url === posts) clock.set(new Date(now.getTime() + 45_000));
        return fetcher.fetch(url, validators);
      } },
      discoverer: { discover: async () => ok([posts, comments]) },
      gate: { tryAcquire: async () => ({ release: async () => {} }) },
      limits: { daily: 20, total: 1000 },
    });
    expect(unwrapErr(await register.execute(site))).toMatchObject({ type: "FeedUnreachable", reason: "timeout" });
    expect(await feeds.registrationCounts(now)).toEqual({ total: 0, recent: 0 });
    expect(fetcher.calls.map(call => call.url)).toEqual([site, posts]);
  });
});


it("offers already registered feeds alongside other choices without creating another actor", async () => {
  const { feeds, register } = setup();
  unwrap(await register.execute(posts));
  const result = unwrapErr(await register.execute(site));
  expect(result).toMatchObject({ type: "MultipleFeeds", candidates: [
    { url: posts, registered: true }, { url: comments, registered: false },
  ] });
  expect(await feeds.registrationCounts(now)).toEqual({ total: 1, recent: 1 });
});
it("never fetches more than eight unique discovered candidates", async () => {
  const urls = Array.from({ length: 12 }, (_, i) => unwrap(FeedUrl.create("https://example.com/feed-" + i + ".xml")));
  const { feeds, fetcher, register } = setup(urls);
  for (const url of urls) fetcher.respondWith(url, ok(fetchedFeed({ title: url })));
  const result = unwrapErr(await register.execute(site));
  expect(result.type).toBe("MultipleFeeds");
  expect(fetcher.calls.map(call => call.url)).toEqual([site, ...urls.slice(0, 8)]);
  expect(await feeds.registrationCounts(now)).toEqual({ total: 0, recent: 0 });
});
it("does not offer a Mastodon account RSS as a bridge candidate", async () => {
  const account = unwrap(FeedUrl.create("https://social.example/@alice.rss"));
  const { fetcher, register } = setup([account, posts]);
  fetcher.respondWith(account, ok(fetchedFeed({ generator: "Mastodon" })));
  expect(unwrap(await register.execute(site)).feed.url).toBe(posts);
});
