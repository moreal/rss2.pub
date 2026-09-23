import { resolve } from "node:path";
import { renderToString } from "@solidjs/web";
import { createLogger, createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type FederationPages = typeof import("../../../packages/web-ui/src/federation/pages.js");
let ui: FederationPages;
let vite: ViteDevServer;

beforeAll(async () => {
  vite = await createServer({
    configFile: resolve("packages/web-ui/vite.config.ts"),
    customLogger: createLogger("silent"),
    server: { middlewareMode: true, hmr: false },
  });
  ui = await vite.ssrLoadModule("/src/federation/pages.tsx") as FederationPages;
});

afterAll(async () => { await vite?.close(); });

describe("Solid federation page bodies", () => {
  it("renders a feed or main actor profile with a localized follow form and post list", () => {
    const html = renderToString(() => ui.ActorProfile({
      model: {
        handle: "tech", host: "rss2.pub", name: "技術 <ニュース>", iconUrl: null,
        summaryHtml: ui.SanitizedHtml.fromSanitized("<p>Safe <strong>summary</strong></p>"), followersLabel: "12 followers",
        locale: "ja", followHeading: "リモートフォロー", followPlaceholder: "@you@example.social",
        followButton: "Follow", noPostsTitle: "No posts", noPostsBody: "Check later",
        posts: [{ id: "item/1", title: "Hello <world>", previewHtml: ui.SanitizedHtml.fromSanitized("<p>Short <em>preview</em></p>"), publishedIso: "2026-09-23T00:00:00.000Z", publishedLabel: "2026年9月23日" }],
      },
    }));
    expect(html).toContain('class="panel actor-profile"');
    expect(html).toContain("技術 &lt;ニュース>");
    expect(html).toContain("Safe <strong>summary</strong>");
    expect(html).toContain('action="/@tech/remote-follow"');
    expect(html).toContain('name="lang" value="ja"');
    expect(html).toContain('href="/@tech/item%2F1"');
    expect(html).toContain("Hello &lt;world>");
    expect(html).toContain("Short <em>preview</em>");
    expect(html).toContain('datetime="2026-09-23T00:00:00.000Z"');
    expect(html).toContain('<bdi dir="ltr">');
    expect(html).toContain("rss2.pub");
  });

  it("renders the empty actor state without a post list", () => {
    const html = renderToString(() => ui.ActorProfile({
      model: {
        handle: "rss2pub", host: "rss2.pub", name: "rss2.pub", iconUrl: null,
        summaryHtml: ui.SanitizedHtml.fromSanitized("<p>Main actor</p>"), followersLabel: "0 followers",
        locale: "en", followHeading: "Follow", followPlaceholder: "@you@example.social",
        followButton: "Follow", noPostsTitle: "No posts yet", noPostsBody: "Try later",
        posts: [],
      },
    }));
    expect(html).toContain('class="empty-state"');
    expect(html).toContain("No posts yet");
    expect(html).not.toContain('class="posts"');
  });

  it("keeps the fallback mark visible when an actor favicon fails to load", () => {
    const html = renderToString(() => ui.ActorProfile({
      model: {
        handle: "tech", host: "rss2.pub", name: "Tech", iconUrl: "https://example.com/icon.png",
        summaryHtml: ui.SanitizedHtml.fromSanitized(""), followersLabel: "1 follower", locale: "en",
        followHeading: "Follow", followPlaceholder: "@you@example.social", followButton: "Follow",
        noPostsTitle: "No posts", noPostsBody: "Check later", posts: [],
      },
    }));
    expect(html).toContain('src="https://example.com/icon.png"');
    expect(html).toContain('onerror="this.remove()"');
  });

  it("renders a post with author, content warning, source, and localized date", () => {
    const html = renderToString(() => ui.MessageDetail({
      model: {
        handle: "tech", host: "rss2.pub", actorName: "Tech", iconUrl: null,
        title: "Post", summaryHtml: ui.SanitizedHtml.fromSanitized("<p>Warning</p>"), contentHtml: ui.SanitizedHtml.fromSanitized("<p>Full <strong>post</strong></p>"),
        publishedIso: "2026-09-23T00:00:00.000Z", publishedLabel: "23 Sept 2026",
        sourceHref: "https://example.com/entry", viewOriginalLabel: "View original",
      },
    }));
    expect(html).toContain('class="panel actor-message-head"');
    expect(html).toContain('href="/@tech"');
    expect(html).toContain('<h1><bdi dir="auto">Post</bdi></h1>');
    expect(html).toContain("<p>Warning</p>");
    expect(html).toContain('class="panel actor-post-body"');
    expect(html).toContain("Full <strong>post</strong>");
    expect(html).toContain('href="https://example.com/entry"');
    expect(html).toContain("23 Sept 2026");
  });

  it("renders remote-follow failure with an alert and return link", () => {
    const html = renderToString(() => ui.RemoteFollowError({
      model: { actorHandle: "tech", title: "Follow", invalidAccount: "Invalid account", backLabel: "Back to Tech" },
    }));
    expect(html).toContain("<h1>Follow</h1>");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Invalid account");
    expect(html).toContain('href="/@tech"');
    expect(html).toContain("Back to Tech");
  });
});
