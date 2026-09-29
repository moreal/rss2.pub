import { describe, expect, it } from "vitest";
import {
  createCommandHandler,
  parseCommand,
  type ReplyPart,
} from "../../../src/application/handle-command.js";
import { createRegisterFeed } from "../../../src/application/register-feed.js";
import { createInMemoryFeedRepository } from "../../../src/infrastructure/persistence/in-memory-feed-repository.js";
import { err, ok } from "../../../src/shared/result.js";
import { FeedUrl } from "../../../src/domain/feed/feed-url.js";
import { fakeFetcher, fetchedFeed, fixedClock } from "../../helpers/fakes.js";
import { unwrap } from "../../helpers/result.js";

describe("parseCommand", () => {
  it("registers a URL immediately after the main actor mention", () => {
    expect(parseCommand("@rss2pub@rss2.test https://a.co/feed.xml"))
      .toEqual({ type: "register", url: "https://a.co/feed.xml" });
    expect(parseCommand("https://a.co/feed.xml"))
      .toEqual({ type: "register", url: "https://a.co/feed.xml" });
  });
  it("preserves an at-sign inside a feed URL", () => {
    expect(parseCommand("@rss2pub https://social.example/@alice.rss"))
      .toEqual({ type: "register", url: "https://social.example/@alice.rss" });
  });
  it("rejects the retired register command", () => {
    expect(parseCommand("@rss2pub@rss2.test register https://a.co/f"))
      .toEqual({ type: "help" });
    expect(parseCommand("REGISTER https://a.co/f"))
      .toEqual({ type: "help" });
  });

  it("rejects the retired search command", () => {
    expect(parseCommand("SEARCH rust")).toEqual({ type: "help" });
    expect(parseCommand("@rss2pub search cat pictures")).toEqual({ type: "help" });
  });

  it("rejects the retired full option", () => {
    expect(parseCommand("register https://a.co/f full")).toEqual({ type: "help" });
  });

  it("falls back to help for missing arguments or unknown verbs", () => {
    expect(parseCommand("register")).toEqual({ type: "help" });
    expect(parseCommand("search  ")).toEqual({ type: "help" });
    expect(parseCommand("hello there")).toEqual({ type: "help" });
    expect(parseCommand("")).toEqual({ type: "help" });
    expect(parseCommand(`https://example.com/${"x".repeat(5000)}`))
      .toEqual({ type: "help" });
  });
});

/** Flattens reply parts back into plain text, e.g. `@handle@host` for a mention part. */
function flatten(parts: readonly ReplyPart[]): string {
  return parts
    .map((part) => (part.type === "text" ? part.value : part.handle))
    .join("");
}

describe("CommandHandler", () => {
  const now = new Date("2026-07-26T12:00:00Z");

  function setup() {
    const feeds = createInMemoryFeedRepository();
    const fetcher = fakeFetcher();
    const registerFeed = createRegisterFeed({
      feeds,
      fetcher,
      clock: fixedClock(now),
      gate: { tryAcquire: async () => ({ release: async () => {} }) },
      limits: { daily: 20, total: 1000 },
    });
    const handler = createCommandHandler({
      registerFeed,
      host: "rss2.test",
    });
    return { fetcher, handler };
  }

  it("directs Mastodon account RSS registrations to the original actor", async () => {
    const { fetcher, handler } = setup();
    fetcher.respondWith("https://social.example/@alice.rss", ok(fetchedFeed({ generator: "Mastodon" })));
    expect(flatten(await handler.handle("https://social.example/@alice.rss")))
      .toContain("Follow its original account");
  });

  it("registers a feed and replies with its followable account", async () => {
    const { fetcher, handler } = setup();
    fetcher.respondWith(
      "https://a.co/f",
      ok(fetchedFeed({ title: "My Blog" })),
    );
    const reply = await handler.handle("@rss2pub https://a.co/f");
    expect(flatten(reply)).toContain('Registered "My Blog"!');
    expect(flatten(reply)).toMatch(/@a_co_f_[a-z0-9]{7}@rss2\.test/);
    expect(reply).toContainEqual(
      expect.objectContaining({
        type: "mention",
        handle: expect.stringMatching(/@a_co_f_[a-z0-9]{7}@rss2\.test/),
      }),
    );
  });

  it("does not execute the retired register command", async () => {
    const { fetcher, handler } = setup();
    fetcher.respondWith("https://a.co/f", ok(fetchedFeed({ title: "My Blog" })));
    expect(flatten(await handler.handle("register https://a.co/f")))
      .toContain("@rss2pub <url>");
    expect(fetcher.calls).toHaveLength(0);
  });

  it("tells the user when the feed already exists", async () => {
    const { fetcher, handler } = setup();
    fetcher.respondWith("https://a.co/f", ok(fetchedFeed({})));
    await handler.handle("https://a.co/f");
    const reply = await handler.handle("https://a.co/f");
    expect(flatten(reply)).toContain("Already registered");
    expect(flatten(reply)).toMatch(/@a_co_f_[a-z0-9]{7}@rss2\.test/);
    expect(reply).toContainEqual(
      expect.objectContaining({
        type: "mention",
        handle: expect.stringMatching(/@a_co_f_[a-z0-9]{7}@rss2\.test/),
      }),
    );
  });

  it("explains feed registration failures", async () => {
    const { fetcher, handler } = setup();
    expect(flatten(await handler.handle("http://[not-a-url"))).toContain(
      "doesn't look like a URL",
    );
    expect(flatten(await handler.handle("ftp://a.co/f"))).toContain(
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
    expect(
      flatten(await handler.handle("https://dead.example/f")),
    ).toContain("couldn't find an Atom or RSS 2.0 feed");
  });

  it("does not search from a mention", async () => {
    const { fetcher, handler } = setup();
    fetcher.respondWith(
      "https://rust.blog/rss",
      ok(fetchedFeed({ title: "Rust Blog" })),
    );
    await handler.handle("https://rust.blog/rss");

    const reply = flatten(await handler.handle("search rust"));
    expect(reply).toContain("@rss2pub <url>");
    expect(reply).not.toContain("Found:");
  });

  it("answers anything else with Atom/RSS 2.0 usage help", async () => {
    const { handler } = setup();
    const reply = flatten(await handler.handle("@rss2pub hi!"));
    expect(reply).toContain(
      "I turn Atom or RSS 2.0 feeds into followable fediverse accounts. Send me:",
    );
    expect(reply).not.toContain("RSS/Atom");
    expect(reply).toContain("@rss2pub <url>");
    expect(reply).not.toContain("search <keyword>");
  });
});
