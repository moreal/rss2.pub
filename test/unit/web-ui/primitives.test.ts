import { resolve } from "node:path";
import { renderToString } from "@solidjs/web";
import { createLogger, createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type Primitives = typeof import("../../../packages/web-ui/src/primitives/index.js");
let ui: Primitives;
let vite: ViteDevServer;

beforeAll(async () => {
  vite = await createServer({
    configFile: resolve("packages/web-ui/vite.config.ts"),
    customLogger: createLogger("silent"),
    server: { middlewareMode: true, hmr: false },
  });
  ui = await vite.ssrLoadModule("/src/primitives/index.tsx") as Primitives;
});

afterAll(async () => { await vite?.close(); });

describe("Solid UI primitives", () => {
  it("keeps account identifiers isolated from surrounding direction", () => {
    const html = renderToString(() => ui.AccountHandle({ handle: "example", host: "rss2.pub", variant: "copy" }));
    expect(html).toMatch(/data-select-all/);
    expect(html).toMatch(/<bdi dir="ltr">/);
    expect(html).toMatch(/example/);
    expect(html).toMatch(/<wbr/);
    expect(html).toMatch(/rss2.pub/);
  });

  it("preserves button tiers and native button behavior", () => {
    const html = renderToString(() => ui.Button({ variant: "secondary", type: "submit", children: "Search" }));
    expect(html).toMatch(/class="btn btn-secondary"/);
    expect(html).toMatch(/type="submit"/);
    expect(html).toMatch(/>Search<\/button>/);
  });

  it("renders semantic notice content with an announced state", () => {
    const html = renderToString(() => ui.Notice({ kind: "error", live: "alert", title: "Try again", children: "Invalid URL" }));
    expect(html).toMatch(/class="notice notice-error"/);
    expect(html).toMatch(/role="alert"/);
    expect(html).toMatch(/Try again/);
    expect(html).toMatch(/Invalid URL/);
  });

  it("connects field help and error to its native input", () => {
    const html = renderToString(() => ui.Field({ id: "url", label: "Feed URL", help: "Enter an Atom URL", error: "Required", type: "url", name: "url" }));
    expect(html).toMatch(/for="url"/);
    expect(html).toMatch(/aria-describedby="url-error url-help"/);
    expect(html).toMatch(/aria-invalid="true"/);
    expect(html).toMatch(/id="url-help"/);
    expect(html).toMatch(/id="url-error"/);
  });

  it("renders feed content safely and keeps a clipped metadata row", () => {
    const feed = { handle: "tech", title: "기술 <뉴스>", description: "Ein Überblick", url: "https://example.com/feed", iconUrl: null, href: "/@tech" };
    const html = renderToString(() => ui.FeedList({ children: ui.FeedCard({ feed, host: "rss2.pub", followersLabel: "12 followers", level: 2 }) }));
    expect(html).toMatch(/<ul[^>]*class="feeds">/);
    expect(html).toMatch(/<h2[^>]*class="feed-title">/);
    expect(html).toMatch(/기술 &lt;뉴스>/);
    expect(html).toMatch(/Ein Überblick/);
    expect(html).toMatch(/12 followers/);
    expect(html).toMatch(/example.com\/feed/);
    expect(html).toMatch(/<bdi dir="auto">/);
    expect(html).toMatch(/<bdi dir="ltr">/);
  });

  it("removes a failed favicon in server rendered feed cards", () => {
    const feed = { handle: "tech", title: "Tech", description: null, url: "https://example.com/feed", iconUrl: "https://example.com/missing.ico", href: "/@tech" };
    const html = renderToString(() => ui.FeedCard({ feed, host: "rss2.pub" }));
    expect(html).toContain('onerror="this.remove()"');
  });

  it("shares the same avatar fallback for profile and feed sizes", () => {
    const html = renderToString(() => ui.Avatar({ iconUrl: "https://example.com/icon.ico", variant: "profile" }));
    expect(html).toContain('class="avatar actor-avatar"');
    expect(html).toContain('width="32" height="32"');
    expect(html).toContain('onerror="this.remove()"');
  });
});
