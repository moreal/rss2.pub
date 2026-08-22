import { describe, expect, it } from "vitest";
import {
  createCommandHandler,
  parseCommand,
} from "../../../src/application/handle-command.js";
import { createRegisterFeed } from "../../../src/application/register-feed.js";
import { createSearchFeeds } from "../../../src/application/search-feeds.js";
import { createInMemoryFeedRepository } from "../../../src/infrastructure/persistence/in-memory-feed-repository.js";
import { err, ok } from "../../../src/shared/result.js";
import { FeedUrl } from "../../../src/domain/feed/feed-url.js";
import { fakeFetcher, fetchedFeed, fixedClock } from "../../helpers/fakes.js";
import { unwrap } from "../../helpers/result.js";

describe("parseCommand", () => {
  it("parses register with a URL, ignoring the leading mention", () => {
    expect(
      parseCommand("@rss2pub@rss2.test register https://a.co/f"),
    ).toEqual({ type: "register", url: "https://a.co/f", fullContentEnabled: false });
  });

  it("is case-insensitive on the verb", () => {
    expect(parseCommand("REGISTER https://a.co/f")).toEqual({
      type: "register",
      url: "https://a.co/f",
      fullContentEnabled: false,
    });
  });

  it("parses a trailing 'full' as opting into full-content extraction (ADR-0009)", () => {
    expect(parseCommand("register https://a.co/f full")).toEqual({
      type: "register",
      url: "https://a.co/f",
      fullContentEnabled: true,
    });
    expect(parseCommand("register https://a.co/f FULL")).toMatchObject({
      fullContentEnabled: true,
    });
    expect(parseCommand("register https://a.co/f other")).toMatchObject({
      fullContentEnabled: false,
    });
  });

  it("joins multi-word search keywords", () => {
    expect(parseCommand("@rss2pub search cat pictures")).toEqual({
      type: "search",
      keyword: "cat pictures",
    });
  });

  it("falls back to help for missing arguments or unknown verbs", () => {
    expect(parseCommand("register")).toEqual({ type: "help" });
    expect(parseCommand("search  ")).toEqual({ type: "help" });
    expect(parseCommand("hello there")).toEqual({ type: "help" });
    expect(parseCommand("")).toEqual({ type: "help" });
  });
});

describe("CommandHandler", () => {
  const now = new Date("2026-07-26T12:00:00Z");

  function setup() {
    const feeds = createInMemoryFeedRepository();
    const fetcher = fakeFetcher();
    const registerFeed = createRegisterFeed({
      feeds,
      fetcher,
      clock: fixedClock(now),
    });
    const searchFeeds = createSearchFeeds({ feeds });
    const handler = createCommandHandler({
      registerFeed,
      searchFeeds,
      host: "rss2.test",
    });
    return { fetcher, handler };
  }

  it("registers a feed and replies with its followable account", async () => {
    const { fetcher, handler } = setup();
    fetcher.respondWith(
      "https://a.co/f",
      ok(fetchedFeed({ title: "My Blog" })),
    );
    const reply = await handler.handle("@rss2pub register https://a.co/f");
    expect(reply).toContain("Registered My Blog!");
    expect(reply).toMatch(/@a_co_f_[a-z0-9]{7}@rss2\.test/);
  });

  it("registers the full-content variant as a distinct, separately followable account", async () => {
    const { fetcher, handler } = setup();
    fetcher.respondWith("https://a.co/f", ok(fetchedFeed({ title: "My Blog" })));
    const teaser = await handler.handle("register https://a.co/f");
    const full = await handler.handle("register https://a.co/f full");
    expect(teaser).toContain("Registered My Blog!");
    expect(full).toContain("Registered My Blog!");
    const teaserHandle = /@(a_co_f_[a-z0-9]{7})@rss2\.test/.exec(teaser)?.[1];
    const fullHandle = /@(a_co_f_[a-z0-9]{7})@rss2\.test/.exec(full)?.[1];
    expect(teaserHandle).toBeDefined();
    expect(fullHandle).toBeDefined();
    expect(fullHandle).not.toBe(teaserHandle);
  });

  it("tells the user when the feed already exists", async () => {
    const { fetcher, handler } = setup();
    fetcher.respondWith("https://a.co/f", ok(fetchedFeed({})));
    await handler.handle("register https://a.co/f");
    const reply = await handler.handle("register https://a.co/f");
    expect(reply).toContain("Already registered");
    expect(reply).toMatch(/@a_co_f_[a-z0-9]{7}@rss2\.test/);
  });

  it("explains registration failures", async () => {
    const { fetcher, handler } = setup();
    expect(await handler.handle("register not-a-url")).toContain(
      "doesn't look like a URL",
    );
    expect(await handler.handle("register ftp://a.co/f")).toContain(
      "Only http(s) feeds are supported",
    );
    fetcher.respondWith(
      "https://dead.example/f",
      err({
        type: "RequestFailed",
        url: unwrap(FeedUrl.create("https://dead.example/f")),
        message: "connection refused",
      }),
    );
    expect(await handler.handle("register https://dead.example/f")).toContain(
      "couldn't read a feed",
    );
  });

  it("lists search hits with account handles", async () => {
    const { fetcher, handler } = setup();
    fetcher.respondWith(
      "https://rust.blog/rss",
      ok(fetchedFeed({ title: "Rust Blog" })),
    );
    await handler.handle("register https://rust.blog/rss");

    const reply = await handler.handle("search rust");
    expect(reply).toContain("Found:");
    expect(reply).toMatch(/@rust_blog_rss_[a-z0-9]{7}@rss2\.test — Rust Blog/);
  });

  it("suggests registering when a search finds nothing", async () => {
    const { handler } = setup();
    const reply = await handler.handle("search nothing");
    expect(reply).toContain('No feeds found for "nothing"');
  });

  it("answers anything else with usage help", async () => {
    const { handler } = setup();
    const reply = await handler.handle("@rss2pub hi!");
    expect(reply).toContain("register <feed-url>");
    expect(reply).toContain("search <keyword>");
  });
});
