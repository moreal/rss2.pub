import { describe, expect, it } from "vitest";
import {
  createPollDueFeeds,
  createPollFeed,
} from "../../../src/application/poll-feed.js";
import { ContentPolicy } from "../../../src/domain/content/content-policy.js";
import { FeedId } from "../../../src/domain/feed/feed.js";
import { PollPolicy } from "../../../src/domain/feed/poll-policy.js";
import { createInMemoryFeedRepository } from "../../../src/infrastructure/persistence/in-memory-feed-repository.js";
import { createInMemoryItemRepository } from "../../../src/infrastructure/persistence/in-memory-item-repository.js";
import { err, ok } from "../../../src/shared/result.js";
import {
  capturingFederation,
  fakeContentExtractor,
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
  const contentExtractor = fakeContentExtractor();
  const clock = mutableClock(now);
  const pollFeed = createPollFeed({
    feeds,
    items,
    fetcher,
    federation,
    contentExtractor,
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
    contentExtractor,
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
