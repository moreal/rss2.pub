import { describe, expect, it } from "vitest";
import type { RegisterFeed } from "../../../src/application/register-feed.js";
import type {
  ListPopularFeeds,
  SearchFeeds,
} from "../../../src/application/search-feeds.js";
import { err, ok } from "../../../src/shared/result.js";
import { createWebRoutes, type WebDeps } from "../../../src/web/routes.js";
import { makeFeed } from "../../helpers/fakes.js";

const FEED = makeFeed({
  url: "https://example.com/feed.xml",
  handle: "example",
  title: "Example Blog",
});

const ORIGIN = "https://rss2.test";

function webApp(overrides: Partial<WebDeps> = {}) {
  const registerFeed: RegisterFeed = {
    execute: async () => ok({ feed: FEED, created: true }),
  };
  // Mirrors createSearchFeeds: a blank keyword is rejected rather than run,
  // and /search reads that rejection as "nothing asked yet". A fake that
  // answered ok([]) would let the route pass a case the real one never sends.
  const searchFeeds: SearchFeeds = {
    execute: async (keyword) =>
      keyword.trim() === "" ? err({ type: "EmptyQuery" }) : ok([]),
  };
  const listPopularFeeds: ListPopularFeeds = {
    execute: async () => [{ feed: FEED, followerCount: 2 }],
  };
  return createWebRoutes({
    origin: ORIGIN,
    host: "rss2.test",
    registerFeed,
    searchFeeds,
    listPopularFeeds,
    ready: async () => true,
    ...overrides,
  });
}

const HEALTH_PATHS = ["/healthz", "/readyz"];

/** `app.request` may answer synchronously, so it is not a thenable. */
async function bodyOf(res: Response | Promise<Response>): Promise<string> {
  return (await res).text();
}

describe("language negotiation", () => {
  it.each([
    {
      from: "region tags in Accept-Language",
      path: "/",
      headers: { "accept-language": "ko-KR,ko;q=0.9,en;q=0.8" },
      expected: "ko",
    },
    {
      from: "?lang= winning over Accept-Language",
      path: "/?lang=ko",
      headers: { "accept-language": "en-US,en;q=0.9" },
      expected: "ko",
    },
    {
      from: "the persisted cookie",
      path: "/",
      headers: { cookie: "lang=ko" },
      expected: "ko",
    },
    {
      from: "?lang= winning over the cookie",
      path: "/?lang=en",
      headers: { cookie: "lang=ko" },
      expected: "en",
    },
    {
      from: "an unsupported language",
      path: "/",
      headers: { "accept-language": "fr-FR,fr;q=0.9" },
      expected: "en",
    },
    { from: "no signal at all", path: "/", headers: {}, expected: "en" },
  ])("resolves $from to $expected", async ({ path, headers, expected }) => {
    const res = await webApp().request(path, { headers });
    expect(await res.text()).toContain(`<html lang="${expected}">`);
  });

  it("applies to every HTML page, so none can silently serve English", async () => {
    const app = webApp();
    const pages = [
      ...new Set(
        app.routes
          .filter((route) => route.method === "GET")
          .map((route) => route.path),
      ),
    ].filter((path) => !HEALTH_PATHS.includes(path));

    expect(pages.length).toBeGreaterThan(0);
    for (const path of pages) {
      const res = await app.request(`${path}?lang=ko`);
      expect(await res.text(), path).toContain('<html lang="ko">');
    }
  });

  it("persists the choice in a site-wide cookie", async () => {
    const cookie = (await webApp().request("/?lang=ko")).headers.get(
      "set-cookie",
    );
    expect(cookie).toContain("lang=ko");
    // Path=/ is what makes the choice survive across pages.
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("marks negotiated pages as varying, so shared caches don't mix locales", async () => {
    const page = await webApp().request("/");
    expect(page.headers.get("vary")).toBe("Accept-Language, Cookie");
  });

  it.each(HEALTH_PATHS)("leaves %s free of cookies and Vary", async (path) => {
    const res = await webApp().request(path);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("vary")).toBeNull();
  });
});

describe("locale discoverability", () => {
  it("advertises every locale to crawlers, which ignore hreflang on links", async () => {
    const html = await bodyOf(webApp().request("/search?q=abc"));
    expect(html).toContain(
      `<link rel="canonical" href="${ORIGIN}/search?q=abc&amp;lang=en"/>`,
    );
    expect(html).toContain(
      `<link rel="alternate" hreflang="ko" href="${ORIGIN}/search?q=abc&amp;lang=ko"/>`,
    );
    expect(html).toContain(
      `<link rel="alternate" hreflang="x-default" href="${ORIGIN}/search?q=abc"/>`,
    );
  });

  it("keeps x-default language-neutral even when the URL pins a locale", async () => {
    const html = await bodyOf(webApp().request("/?lang=ko"));
    // x-default must be the URL that negotiates — not the Korean one we're on.
    expect(html).toContain(
      `<link rel="alternate" hreflang="x-default" href="${ORIGIN}/"/>`,
    );
    expect(html).toContain(
      `<link rel="canonical" href="${ORIGIN}/?lang=ko"/>`,
    );
  });

  it("links the switcher to the same page", async () => {
    const html = await bodyOf(webApp().request("/search?q=abc"));
    expect(html).toContain('href="/search?q=abc&amp;lang=ko"');
    expect(html).toContain("한국어");
  });

  it("points the switcher home on non-GET pages, which are not addressable", async () => {
    const form = new FormData();
    form.set("url", "https://example.com/feed.xml");
    const res = await webApp().request("/register", {
      method: "POST",
      body: form,
    });
    expect(await res.text()).toContain('href="/?lang=ko"');
  });
});

describe("localized page chrome", () => {
  it.each([
    { path: "/?lang=ko", title: "rss2.pub" },
    { path: "/search?lang=ko", title: "검색 · rss2.pub" },
  ])("titles $path as $title", async ({ path, title }) => {
    const html = await bodyOf(webApp().request(path));
    expect(html).toContain(`<title>${title}</title>`);
  });

  it("localizes the meta description", async () => {
    const html = await bodyOf(webApp().request("/?lang=ko"));
    expect(html).toContain(
      '<meta name="description" content="페디버스에서 RSS/Atom 피드를 팔로우하세요."/>',
    );
  });

  it("ships usable motion selectors and a reduced-motion alternative", async () => {
    const html = await bodyOf(webApp().request("/"));
    expect(html).toContain("main .page-head, main .panel");
    expect(html).toContain("@media (prefers-reduced-motion: reduce)");
  });

  // Hono escapes `"`, `<`, `>` and `&` in text children; a stylesheet that
  // went through that would lose every quoted font name and child selector,
  // silently dropping the declaration. `raw()` is what prevents it.
  it("emits the stylesheet unescaped, so quoted font names survive", async () => {
    const html = await bodyOf(webApp().request("/"));
    expect(html).toContain('"Segoe UI"');
    expect(html).not.toContain("&quot;Segoe UI&quot;");
  });
});

describe("localized content", () => {
  it("renders Korean home copy", async () => {
    const html = await bodyOf(webApp().request("/?lang=ko"));
    expect(html).toContain("피드 등록");
    expect(html).toContain("팔로워가 가장 많은 피드");
    expect(html).toContain("팔로워 2명");
  });

  it("renders the Korean empty-search notice with the query", async () => {
    const html = await bodyOf(webApp().request("/search?q=없는피드&lang=ko"));
    expect(html).toContain("“없는피드”에 해당하는 피드가 없습니다");
  });

  it("offers registration as the way out of an empty search", async () => {
    const html = await bodyOf(webApp().request("/search?q=없는피드&lang=ko"));
    expect(html).toContain("피드 등록하기");
  });

  it("escapes user input echoed into a localized notice", async () => {
    const html = await bodyOf(webApp().request("/search?q=%3Cscript%3E&lang=ko"));
    expect(html).toContain("&lt;script&gt;");
    // The exact injection point: the query sits between curly quotes.
    expect(html).not.toContain("“<script>”");
  });

  it("renders matched feeds instead of the empty notice", async () => {
    const searchFeeds: SearchFeeds = { execute: async () => ok([FEED]) };
    const html = await bodyOf(
      webApp({ searchFeeds }).request("/search?q=example&lang=ko"),
    );
    expect(html).toContain("@example@rss2.test");
    expect(html).toContain("Example Blog");
    expect(html).not.toContain("해당하는 피드가 없습니다");
  });

  it("shows a feed description when the feed has one", async () => {
    const described = makeFeed({
      url: "https://example.com/feed.xml",
      handle: "example",
      title: "Example Blog",
      description: "a blog about examples",
    });
    const searchFeeds: SearchFeeds = { execute: async () => ok([described]) };
    const html = await bodyOf(
      webApp({ searchFeeds }).request("/search?q=example"),
    );
    expect(html).toContain('<p class="feed-desc">a blog about examples</p>');
  });

  it("browses instead of failing when no query has been typed yet", async () => {
    const res = await webApp().request("/search?lang=ko");
    expect(res.status).toBe(200);
    const html = await res.text();
    // Nobody has asked anything yet, so the page answers with what there is
    // to follow rather than with an empty box and an instruction.
    expect(html).toContain("팔로워가 가장 많은 피드");
    expect(html).toContain("@example@rss2.test");
    // A blank query is not a failed search, so it must not read like one.
    expect(html).not.toContain("해당하는 피드가 없습니다");
  });
});

/**
 * The most-followed list is the product's only way to *browse* rather than
 * search, and it lives in two places: a screenful of it on the home page,
 * all of it on /search. These pin the seam between them — the home page must
 * not grow without bound, and the link to the rest must appear exactly when
 * there is a rest.
 */
describe("browsing the most-followed feeds", () => {
  function manyFeeds(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      feed: makeFeed({
        url: `https://example.com/${i}.xml`,
        handle: `feed${i}`,
        title: `Feed ${i}`,
      }),
      followerCount: count - i,
    }));
  }

  /** Records what limit the page asked for, and answers with that many. */
  function countingPopular(available: number) {
    const asked: (number | undefined)[] = [];
    const listPopularFeeds: ListPopularFeeds = {
      execute: async (limit) => {
        asked.push(limit);
        return manyFeeds(Math.min(available, limit ?? available));
      },
    };
    return { asked, listPopularFeeds };
  }

  it("shows a screenful on the home page, not the whole database", async () => {
    const { asked, listPopularFeeds } = countingPopular(50);
    const html = await bodyOf(webApp({ listPopularFeeds }).request("/"));
    expect(html.match(/class="feed-title"/g)).toHaveLength(8);
    // One row past the limit is fetched and dropped: that extra row is how
    // the page knows something was left out.
    expect(asked).toEqual([9]);
    expect(html).toContain("See more feeds");
  });

  it("omits the link to the rest when the home page is already the rest", async () => {
    const { listPopularFeeds } = countingPopular(3);
    const html = await bodyOf(webApp({ listPopularFeeds }).request("/"));
    expect(html.match(/class="feed-title"/g)).toHaveLength(3);
    expect(html).not.toContain("See more feeds");
  });

  it("lists the full set on /search, which is where the link points", async () => {
    const { asked, listPopularFeeds } = countingPopular(50);
    const html = await bodyOf(webApp({ listPopularFeeds }).request("/search"));
    // No limit of its own: /search browses whatever the use case considers
    // the popular set (ListPopularFeeds owns that number).
    expect(asked).toEqual([undefined]);
    expect(html).toContain("Most followed feeds");
  });

  it("keeps the shortened list on a bounced registration", async () => {
    const { asked, listPopularFeeds } = countingPopular(50);
    const registerFeed: RegisterFeed = {
      execute: async () => err({ type: "NotAUrl", raw: "nope" }),
    };
    const form = new FormData();
    form.set("url", "nope");
    const res = await webApp({ listPopularFeeds, registerFeed }).request(
      "/register",
      { method: "POST", body: form },
    );
    expect(res.status).toBe(422);
    expect(asked).toEqual([9]);
  });

  it("points an instance with no feeds at all back at registration", async () => {
    const listPopularFeeds: ListPopularFeeds = { execute: async () => [] };
    const html = await bodyOf(
      webApp({ listPopularFeeds }).request("/search?lang=ko"),
    );
    expect(html).toContain("아직 등록된 피드가 없습니다");
    expect(html).toContain("피드 등록하기");
  });
});

describe("the search field", () => {
  it("describes what matches instead of echoing its own label", async () => {
    const html = await bodyOf(webApp().request("/search"));
    // A placeholder that repeats the label teaches nothing and vanishes on
    // the first keystroke; the sentence that explains the field is help text
    // wired to the input, and the placeholder shows examples.
    expect(html).toContain('aria-describedby="search-q-help"');
    expect(html).toContain(
      '<p class="help" id="search-q-help">Type part of a feed’s name, description, or address.</p>',
    );
    expect(html).toContain('placeholder="rust, weather, example.com"');
  });

  it("names the result section with the count, so it is said once", async () => {
    const searchFeeds: SearchFeeds = { execute: async () => ok([FEED]) };
    const html = await bodyOf(
      webApp({ searchFeeds }).request("/search?q=example"),
    );
    expect(html).toContain('aria-labelledby="results-count"');
    expect(html).toContain(
      '<p class="help" id="results-count" role="status">1 feed matches “example”</p>',
    );
  });
});

describe("feed cards", () => {
  it("links each card to the feed's profile page from its title", async () => {
    const html = await bodyOf(webApp().request("/"));
    // The title is the link, so the card's accessible name is the feed name
    // rather than every line of the row concatenated.
    expect(html).toContain(
      '<h3 class="feed-title"><a href="/@example">Example Blog</a></h3>',
    );
  });

  it("keeps the fediverse handle on the card, below the name", async () => {
    const html = await bodyOf(webApp().request("/"));
    const title = html.indexOf('href="/@example"');
    expect(html.slice(title)).toContain("@example@rss2.test");
  });

  it("badges full-content feeds and leaves plain feeds unbadged (ADR-0009)", async () => {
    const fullFeed = makeFeed({
      url: "https://full.example/feed.xml",
      handle: "fullexample",
      title: "Full Example",
      fullContentEnabled: true,
    });
    const searchFeeds: SearchFeeds = { execute: async () => ok([fullFeed, FEED]) };
    const html = await bodyOf(webApp({ searchFeeds }).request("/search?q=example"));
    expect(html).toContain('<span class="tag tag-accent">Full content</span>');
    // FEED (not full-content) still renders, but without the badge markup.
    const feedCardStart = html.indexOf('href="/@example"');
    expect(html.slice(feedCardStart, feedCardStart + 400)).not.toContain(
      "tag-accent",
    );
  });
});

describe("registration outcomes", () => {
  async function postRegister(app: ReturnType<typeof webApp>, query = "") {
    const form = new FormData();
    form.set("url", "https://example.com/feed.xml");
    return app.request(`/register${query}`, { method: "POST", body: form });
  }

  it("registers without full-content mode when the checkbox is unset", async () => {
    const calls: { url: string; fullContentEnabled: boolean | undefined }[] = [];
    const registerFeed: RegisterFeed = {
      execute: async (url, fullContentEnabled) => {
        calls.push({ url, fullContentEnabled });
        return ok({ feed: FEED, created: true });
      },
    };
    const form = new FormData();
    form.set("url", "https://example.com/feed.xml");
    await webApp({ registerFeed }).request("/register", {
      method: "POST",
      body: form,
    });
    expect(calls).toEqual([
      { url: "https://example.com/feed.xml", fullContentEnabled: false },
    ]);
  });

  it("opts into full-content mode when the checkbox is checked (ADR-0009)", async () => {
    const calls: { url: string; fullContentEnabled: boolean | undefined }[] = [];
    const registerFeed: RegisterFeed = {
      execute: async (url, fullContentEnabled) => {
        calls.push({ url, fullContentEnabled });
        return ok({ feed: FEED, created: true });
      },
    };
    const form = new FormData();
    form.set("url", "https://example.com/feed.xml");
    form.set("full", "1");
    await webApp({ registerFeed }).request("/register", {
      method: "POST",
      body: form,
    });
    expect(calls).toEqual([
      { url: "https://example.com/feed.xml", fullContentEnabled: true },
    ]);
  });

  it.each([
    { created: true, expected: "등록되었습니다" },
    { created: false, expected: "이미 등록된 피드입니다" },
  ])(
    "distinguishes created=$created in Korean",
    async ({ created, expected }) => {
      const registerFeed: RegisterFeed = {
        execute: async () => ok({ feed: FEED, created }),
      };
      const res = await postRegister(webApp({ registerFeed }), "?lang=ko");
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain(expected);
      expect(html).toContain("@example@rss2.test");
    },
  );

  it.each([
    {
      failure: "NotAUrl",
      error: { type: "NotAUrl", raw: "nope" },
      expected: "URL 형식이 아닌 것 같습니다: nope",
    },
    {
      failure: "UnsupportedProtocol",
      // URL.protocol carries a trailing colon that must not reach the user.
      error: { type: "UnsupportedProtocol", raw: "ftp://x", protocol: "ftp:" },
      expected: "http(s) 피드만 지원합니다 (받은 값: ftp).",
    },
    {
      failure: "FeedUnreachable",
      error: { type: "FeedUnreachable", url: FEED.url, message: "boom" },
      // Only {message} reaches the copy; url is here to satisfy the union.
      expected: "해당 주소에서 피드를 읽지 못했습니다: boom",
    },
  ] as const)("localizes the $failure failure", async ({ error, expected }) => {
    const registerFeed: RegisterFeed = { execute: async () => err(error) };
    const res = await postRegister(webApp({ registerFeed }), "?lang=ko");
    expect(res.status).toBe(422);
    expect(await res.text()).toContain(expected);
  });

  it("localizes a submission with no URL field", async () => {
    const res = await webApp().request("/register?lang=ko", {
      method: "POST",
      body: new FormData(),
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("피드 URL이 없습니다.");
  });
});

describe("recovering from a rejected registration", () => {
  const rejecting: RegisterFeed = {
    execute: async () => err({ type: "NotAUrl", raw: "nope" } as const),
  };

  async function reject(full = false) {
    const form = new FormData();
    form.set("url", "nope");
    if (full) form.set("full", "1");
    return webApp({ registerFeed: rejecting }).request("/register", {
      method: "POST",
      body: form,
    });
  }

  it("hands back the form with the rejected URL still in it", async () => {
    const html = await bodyOf(reject());
    // Retyping a long feed URL is the cost of getting this wrong.
    expect(html).toContain('value="nope"');
    expect(html).toContain('<form class="register-form field"');
  });

  it("ties the reason to the field for assistive tech", async () => {
    const html = await bodyOf(reject());
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="register-url-error register-url-help"');
    expect(html).toContain('<p id="register-url-error">');
    expect(html).toContain('role="alert"');
  });

  it("moves focus to the field that needs fixing", async () => {
    expect(await bodyOf(reject())).toContain("autofocus");
  });

  it("preserves the full-content choice (ADR-0009)", async () => {
    expect(await bodyOf(reject(true))).toContain('value="1" checked');
  });

  it("still answers 422 — only the body moved, not the contract", async () => {
    expect((await reject()).status).toBe(422);
  });
});

describe("finishing a registration", () => {
  async function succeed() {
    const form = new FormData();
    form.set("url", "https://example.com/feed.xml");
    return bodyOf(webApp().request("/register", { method: "POST", body: form }));
  }

  it("puts the account name one click from the clipboard", async () => {
    const html = await succeed();
    expect(html).toContain('data-copy="@example@rss2.test"');
    // Ships hidden and is revealed only where the Clipboard API exists.
    expect(html).toContain("hidden");
  });

  it("links on to the account page, where following happens", async () => {
    expect(await succeed()).toContain('href="/@example"');
  });

  it("offers a way back to registering another feed", async () => {
    expect(await succeed()).toContain("Register another feed");
  });
});

describe("page chrome", () => {
  it("marks the page the user is on in the primary nav", async () => {
    const home = await bodyOf(webApp().request("/"));
    expect(home).toContain('<a href="/" aria-current="page">Home</a>');
    const search = await bodyOf(webApp().request("/search"));
    expect(search).toContain('<a href="/search" aria-current="page">Search</a>');
  });

  it("opens every page with a skip link, the first tab stop", async () => {
    const html = await bodyOf(webApp().request("/"));
    expect(html.indexOf('<a class="skip" href="#main">')).toBeLessThan(
      html.indexOf("<header"),
    );
    expect(html).toContain('<main id="main"');
  });
});

/**
 * Registering fetches the feed over the network, so the gap between pressing
 * the button and seeing a result is seconds long. These pin the parts of the
 * page the enhancement needs; the enhancement itself lives in PENDING_SCRIPT
 * and degrades to an ordinary submit when it does not run.
 */
describe("waiting for a slow registration", () => {
  it("marks the form and labels what the button will say while it waits", async () => {
    const html = await bodyOf(webApp().request("/"));
    expect(html).toContain("data-pending-form");
    expect(html).toContain('data-pending-label="Registering…"');
    // The label lives in its own element so swapping the text leaves the
    // spinner beside it alone.
    expect(html).toContain("data-btn-label");
    expect(html).toContain('<span class="btn-spinner" aria-hidden="true">');
  });

  it("localizes the waiting label", async () => {
    const html = await bodyOf(webApp().request("/?lang=ko"));
    expect(html).toContain('data-pending-label="등록하는 중…"');
  });

  it("gives the wait a live region that starts empty", async () => {
    const html = await bodyOf(webApp().request("/"));
    // Empty until the submission starts: an announced region with text in it
    // would speak on load, before there is anything to report.
    expect(html).toContain(
      '<span class="sr-only" role="status" data-pending-status="true"></span>',
    );
  });
});

describe("the account name to copy", () => {
  async function registered() {
    const form = new FormData();
    form.set("url", "https://example.com/feed.xml");
    return bodyOf(webApp().request("/register", { method: "POST", body: form }));
  }

  it("copies the whole address, and breaks it only at the host", async () => {
    const html = await registered();
    expect(html).toContain('data-copy="@example@rss2.test"');
    // <wbr> is a break opportunity, not a character: the copied and selected
    // text are unchanged, but a narrow screen wraps at the address's seam
    // instead of mid-domain.
    expect(html).toContain("@example<wbr/>@rss2.test");
  });
});

describe("health endpoints", () => {
  it("reports readiness", async () => {
    const res = await webApp().request("/readyz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("reports unreadiness so a broken instance leaves rotation", async () => {
    const res = await webApp({ ready: async () => false }).request("/readyz");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "unavailable" });
  });
});
