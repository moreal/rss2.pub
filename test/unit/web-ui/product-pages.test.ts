import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderToString } from "@solidjs/web";
import { createLogger, createServer, type ViteDevServer } from "vite";
import type * as ProductPages from "../../../packages/web-ui/src/product/pages.js";

let pages: typeof ProductPages;
let vite: ViteDevServer;

beforeAll(async () => {
  vite = await createServer({
    configFile: resolve("packages/web-ui/vite.config.ts"),
    customLogger: createLogger("silent"),
    server: { middlewareMode: true, hmr: false },
  });
  pages = await vite.ssrLoadModule("/src/product/pages.tsx") as typeof ProductPages;
});

afterAll(async () => { await vite?.close(); });

const feed = {
  handle: "news",
  title: "News <Today>",
  description: "Überblick",
  url: "https://example.com/atom.xml",
  iconUrl: null,
  href: "/@news",
};

const search = {
  label: "Search feeds",
  placeholder: "Technology, music…",
  button: "Search",
  help: "Search by title or URL.",
};

const registration = {
  heading: "Register a feed",
  urlLabel: "Feed URL",
  urlHelp: "Enter the feed URL.",
  submitLabel: "Register feed",
  pendingLabel: "Registering…",
  errorHeading: "Could not register",
  errorHint: "Check the URL.",
  draft: { url: "https://bad.example/feed", error: "Invalid feed" },
};

describe("Solid product pages", () => {
  it("keeps home registration state, bot command slots, and popular overflow action", () => {
    const model: ProductPages.HomeViewModel = {
      host: "rss2.pub",
      heading: "Follow feeds",
      lede: "Feed posts in your timeline.",
      registration,
      botAlternative: ["Mention ", { kind: "chip", text: "@rss2pub@rss2.pub" }, " with ", { kind: "code", text: "register <url>" }, "."],
      search,
      popular: {
        heading: "Most followed feeds",
        feeds: [{ feed, followersLabel: "12 followers" }],
        emptyTitle: "No feeds yet",
        emptyHint: "Register the first feed.",
        more: true,
        moreLabel: "See more feeds",
      },
    };
    const html = renderToString(() => pages.HomeBody({ model }));
    expect(html).toMatch(/aria-labelledby="register-heading"/);
    expect(html).toMatch(/aria-describedby="register-url-error register-url-help"/);
    expect(html).toMatch(/value="https:\/\/bad.example\/feed"/);
    expect(html).toMatch(/role="alert"/);
    expect(html).toMatch(/data-pending-form/);
    expect(html).toMatch(/data-pending-label="Registering…"/);
    expect(html).toMatch(/register &lt;url>/);
    expect(html).toMatch(/href="\/search"[^>]*>See more feeds/);
    expect(html).toMatch(/12 followers/);
  });

  it("renders browse and search result states with meaningful section names", () => {
    const browse: ProductPages.SearchViewModel = {
      host: "rss2.pub",
      heading: "Search feeds",
      search,
      state: { kind: "browse", heading: "Most followed feeds", feeds: [{ feed, followersLabel: "12 followers" }], emptyTitle: "No feeds", emptyAction: "Register a feed" },
    };
    const browseHtml = renderToString(() => pages.SearchBody({ model: browse }));
    expect(browseHtml).toMatch(/role="search"/);
    expect(browseHtml).toMatch(/aria-labelledby="popular-heading"/);
    expect(browseHtml).toMatch(/12 followers/);
    const results: ProductPages.SearchViewModel = {
      ...browse,
      state: { kind: "results", query: "News", feeds: [feed], countLabel: "1 result for News", emptyTitle: "No match for News", emptyHint: "Try another term.", emptyAction: "Register a feed" },
    };
    const resultHtml = renderToString(() => pages.SearchBody({ model: results }));
    expect(resultHtml).toMatch(/role="status"/);
    expect(resultHtml).toMatch(/1 result for News/);
    expect(resultHtml).toMatch(/<h2[^>]*class="feed-title"/);
    expect(resultHtml).toMatch(/News &lt;Today>/);
    expect(resultHtml).toMatch(/value="News"/);
  });

  it("renders search and browse empty states with a registration exit", () => {
    const base: ProductPages.SearchViewModel = {
      host: "rss2.pub", heading: "Search feeds", search,
      state: { kind: "browse", heading: "Most followed", feeds: [], emptyTitle: "No feeds", emptyAction: "Register a feed" },
    };
    const browseHtml = renderToString(() => pages.SearchBody({ model: base }));
    expect(browseHtml).toMatch(/No feeds/);
    expect(browseHtml).toMatch(/href="\/"[^>]*>Register a feed/);
    const noResultsHtml = renderToString(() => pages.SearchBody({ model: { ...base, state: { kind: "results", query: "missing", feeds: [], countLabel: "0 results", emptyTitle: "No match", emptyHint: "Try again.", emptyAction: "Register a feed" } } }));
    expect(noResultsHtml).toMatch(/No match/);
    expect(noResultsHtml).toMatch(/Try again/);
    expect(noResultsHtml).not.toMatch(/id="results-count"/);
  });

  it("keeps registration result handle copy data and two next steps", () => {
    const model: ProductPages.RegistrationViewModel = {
      host: "rss2.pub", kind: "created", title: "Feed registered", status: "Ready to follow.", feed,
      nextHeading: "Next steps", copyInstruction: "Copy the address.", followInstruction: "Follow it from your app.",
      copyLabel: "Copy address", copiedLabel: "Copied", openProfile: "Open account", anotherLabel: "Register another",
    };
    const html = renderToString(() => pages.RegisterResultBody({ model }));
    expect(html).toMatch(/role="status"/);
    expect(html).toMatch(/class="steps"/);
    expect(html).toMatch(/data-copy="@news@rss2.pub"/);
    expect(html).toMatch(/data-copied-label="Copied"/);
    expect(html).toMatch(/href="\/@news"/);
    expect((html.match(/data-copy="@news@rss2.pub"/g) ?? []).length).toBe(1);
    expect(html).toMatch(/class="handle handle-value"/);
  });
});
