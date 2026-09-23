import { parseHTML } from "linkedom";
import { describe, expect, it, vi } from "vitest";
import type { FindFeedByHandle } from "../../../src/application/find-feed-by-handle.js";
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
  const findFeedByHandle: FindFeedByHandle = {
    execute: async (handle) =>
      handle === "example" ? ok(FEED) : err({ type: "FeedNotFound" }),
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
    findFeedByHandle,
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

async function postRegister(app: ReturnType<typeof webApp>, query = "") {
  const form = new FormData();
  form.set("url", "https://example.com/feed.xml");
  return app.request(`/register${query}`, { method: "POST", body: form });
}

describe("source availability", () => {
  it("links to the operator's source in the page footer", async () => {
    const response = await webApp({ sourceUrl: "https://code.example/operator/rss2pub" })
      .request("https://rss2.test/");
    expect(await response.text()).toContain('href="https://code.example/operator/rss2pub"');
  });
});

describe("registration admission", () => {
  it("rejects an oversized form before parsing or fetching", async () => {
    const execute = vi.fn<RegisterFeed["execute"]>();
    const response = await webApp({ registerFeed: { execute } }).request("/register", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `url=${"x".repeat(5000)}`,
    });
    expect(response.status).toBe(413);
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns a retryable response when the shared registration budget is busy", async () => {
    const registerFeed: RegisterFeed = {
      execute: async () => err({ type: "RegistrationUnavailable", retryAfterSeconds: 30 }),
    };
    const response = await postRegister(webApp({ registerFeed }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
  });

  it("returns service unavailable when the instance is at capacity", async () => {
    const registerFeed: RegisterFeed = {
      execute: async () => err({ type: "RegistrationUnavailable", retryAfterSeconds: null }),
    };
    const response = await postRegister(webApp({ registerFeed }));
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBeNull();
  });
});

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
      headers: { "accept-language": "xx-YY,xx;q=0.9" },
      expected: "en",
    },
    { from: "no signal at all", path: "/", headers: {}, expected: "en" },
  ])("resolves $from to $expected", async ({ path, headers, expected }) => {
    const res = await webApp().request(path, { headers });
    expect(await res.text()).toContain(`<html lang="${expected}" dir="ltr">`);
  });

  it.each([
    { from: "Taiwan query", path: "/?lang=zh-TW", headers: {}, expected: "zh-Hant-TW" },
    { from: "mainland header", path: "/", headers: { "accept-language": "zh-CN,ja;q=0.8" }, expected: "zh-Hans-CN" },
    { from: "Taiwan header", path: "/", headers: { "accept-language": "zh-TW,zh-CN;q=0.8" }, expected: "zh-Hant-TW" },
    { from: "quality-weighted Chinese header", path: "/", headers: { "accept-language": "zh-CN;q=0.3,zh-TW;q=0.9" }, expected: "zh-Hant-TW" },
    { from: "Taiwan cookie", path: "/", headers: { cookie: "lang=zh-TW" }, expected: "zh-Hant-TW" },
    { from: "unsupported query falling through to header", path: "/?lang=xx", headers: { "accept-language": "ja-JP" }, expected: "ja" },
    { from: "European region", path: "/", headers: { "accept-language": "fr-FR,fr;q=0.9" }, expected: "fr" },
  ])("maps $from to $expected", async ({ path, headers, expected }) => {
    const res = await webApp().request(path, { headers });
    expect(await res.text()).toContain(`<html lang="${expected}" dir="ltr">`);
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
      const res = await app.request(`${path.replace(":handle", "example")}?lang=ko`);
      expect(await res.text(), path).toContain('<html lang="ko" dir="ltr">');
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

  it("renders a usable native menu until Solid hydration succeeds", async () => {
    const html = await bodyOf(webApp().request("/search?q=abc&lang=ko"));
    const { document } = parseHTML(html);
    const nav = document.querySelector("nav.lang");
    const details = nav?.querySelector("#picker-fallback");
    const summary = details?.querySelector("summary");
    const choices = details?.querySelectorAll(".lang-options a");
    const payload = document.querySelector("#picker-props")?.textContent;

    expect(nav?.querySelector("#picker")?.hasAttribute("hidden")).toBe(true);
    expect(nav?.querySelector("#picker .locale-picker-trigger")?.textContent).toContain("KO");
    expect(nav?.querySelector("#picker .locale-picker-trigger")?.getAttribute("aria-label")).toContain("한국어");
    expect(payload).toBeDefined();
    const initial = JSON.parse(payload ?? "null");
    expect(initial.currentLocale).toBe("ko");
    expect(initial.currentShortLabel).toBe("KO");
    expect(initial.options).toHaveLength(12);
    expect(initial.options.find((option: { locale: string }) => option.locale === "en")?.href)
      .toBe("/search?q=abc&lang=en");
    expect(details).not.toBeNull();
    expect(details?.hasAttribute("hidden")).toBe(false);
    expect(details?.hasAttribute("open")).toBe(false);
    expect(summary?.textContent).toContain("KO");
    expect(summary?.getAttribute("aria-label")).toContain("한국어");
    expect(choices?.length).toBe(11);
    expect(details?.querySelector('[aria-current="true"]')?.textContent).toContain("한국어");
    expect(details?.querySelector('a[hreflang="en"]')?.getAttribute("href"))
      .toBe("/search?q=abc&lang=en");
    const options: { locale: string; href: string; label: string }[] = initial.options;
    for (const option of options) {
      const selector = option.locale === initial.currentLocale
        ? `[aria-current="true"][lang="${option.locale}"]`
        : `a[hreflang="${option.locale}"]`;
      const fallback = details?.querySelector(selector);
      expect(fallback?.textContent).toBe(option.label);
      if (option.locale !== initial.currentLocale) expect(fallback?.getAttribute("href")).toBe(option.href);
    }
    expect(html).toContain("/_assets/web-ui/assets/client-");
  });

  it("points the switcher home on rejected POST pages, which are not addressable", async () => {
    const form = new FormData();
    form.set("url", "https://example.com/feed.xml");
    const res = await webApp({
      registerFeed: { execute: async () => err({ type: "NotAUrl", raw: "nope" }) },
    }).request("/register", {
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

  it("localizes the Atom/RSS 2.0 meta description", async () => {
    const html = await bodyOf(webApp().request("/?lang=ko"));
    expect(html).toContain(
      '<meta name="description" content="페디버스에서 Atom 및 RSS 2.0 피드를 팔로우하세요."/>',
    );
  });

  it("ships usable motion selectors and a reduced-motion alternative", async () => {
    const html = await bodyOf(webApp().request("/"));
    expect(html).toContain(
      "main[data-enter] .page-head, main[data-enter] .panel",
    );
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
  it("keeps Korean bot-command slot order and element roles", async () => {
    const { document } = parseHTML(await bodyOf(webApp().request("/?lang=ko")));
    const note = document.querySelector(".panel-note");
    expect(note?.textContent).toBe(
      "페디버스가 더 편하다면 @rss2pub@rss2.test 계정에 register <url> 명령을 멘션하세요.",
    );
    expect(note?.querySelector("span.chip")?.textContent).toBe("@rss2pub@rss2.test");
    expect(note?.querySelector("code.chip")?.textContent).toBe("register <url>");
    expect(note?.querySelector("span.chip")?.compareDocumentPosition(note.querySelector("code.chip"))).toBe(4);
  });

  it.each([
    { path: "/", expected: "Follow any Atom or RSS 2.0 feed from the fediverse" },
    { path: "/?lang=ko", expected: "페디버스에서 어떤 Atom 또는 RSS 2.0 피드든 팔로우하세요" },
  ])("renders Atom/RSS 2.0 product copy at $path", async ({ path, expected }) => {
    const html = await bodyOf(webApp().request(path));
    expect(html).toContain(expected);
  });

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
    const { document } = parseHTML(html);
    expect(document.querySelector("main")?.textContent).toContain("“<script>”");
    expect(document.querySelector("main script")).toBeNull();
  });

  it("renders matched feeds instead of the empty notice", async () => {
    const searchFeeds: SearchFeeds = { execute: async () => ok([FEED]) };
    const html = await bodyOf(
      webApp({ searchFeeds }).request("/search?q=example&lang=ko"),
    );
    expect(parseHTML(html).document.querySelector(".feeds .handle")?.textContent).toBe("@example@rss2.test");
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
    expect(parseHTML(html).document.querySelector(".feed-desc")?.textContent).toBe("a blog about examples");
  });

  it("browses instead of failing when no query has been typed yet", async () => {
    const res = await webApp().request("/search?lang=ko");
    expect(res.status).toBe(200);
    const html = await res.text();
    // Nobody has asked anything yet, so the page answers with what there is
    // to follow rather than with an empty box and an instruction.
    expect(html).toContain("팔로워가 가장 많은 피드");
    expect(parseHTML(html).document.querySelector(".feeds .handle")?.textContent).toBe("@example@rss2.test");
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
    const title = parseHTML(html).document.querySelector(".feed-title a");
    expect(title?.getAttribute("href")).toBe("/@example");
    expect(title?.textContent).toBe("Example Blog");
  });

  it("keeps the fediverse handle on the card, below the name", async () => {
    const html = await bodyOf(webApp().request("/"));
    const { document } = parseHTML(html);
    const card = document.querySelector(".feeds .feed");
    expect(card?.querySelector(".handle")?.textContent).toBe("@example@rss2.test");
    expect(card?.querySelector(".handle")?.hasAttribute("data-select-all")).toBe(true);
    expect(card?.querySelector(".feed-title")?.compareDocumentPosition(card.querySelector(".handle"))).toBe(4);
  });

  it("renders legacy accounts without advertising article extraction", async () => {
    const fullFeed = makeFeed({
      url: "https://full.example/feed.xml",
      handle: "fullexample",
      title: "Full Example",
      fullContentEnabled: true,
    });
    const searchFeeds: SearchFeeds = { execute: async () => ok([fullFeed, FEED]) };
    const html = await bodyOf(webApp({ searchFeeds }).request("/search?q=example"));
    expect(html).not.toContain('<span class="tag tag-accent">Full content</span>');
    // Ordinary feed cards also render without the retired badge.
    const feedCardStart = html.indexOf('href="/@example"');
    expect(html.slice(feedCardStart, feedCardStart + 400)).not.toContain(
      "tag-accent",
    );
  });
});

describe("registration outcomes", () => {
  it("registers the Atom feed URL", async () => {
    const calls: string[] = [];
    const registerFeed: RegisterFeed = {
      execute: async (url) => {
        calls.push(url);
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
      "https://example.com/feed.xml",
    ]);
  });

  it("ignores a legacy full form field", async () => {
    const calls: string[] = [];
    const registerFeed: RegisterFeed = {
      execute: async (url) => {
        calls.push(url);
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
      "https://example.com/feed.xml",
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
      expect(res.status).toBe(303);
      const html = await bodyOf(webApp().request(res.headers.get("location") ?? ""));
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
      expected: "해당 주소에서 Atom 또는 RSS 2.0 피드를 읽을 수 없습니다: boom",
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
    expect(parseHTML(html).document.querySelector("form.register-form.field")).not.toBeNull();
  });

  it("ties the reason to the field for assistive tech", async () => {
    const html = await bodyOf(reject());
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="register-url-error register-url-help"');
    expect(parseHTML(html).document.querySelector("p#register-url-error")?.textContent).toContain("URL");
    expect(html).toContain('role="alert"');
  });

  it("moves focus to the field that needs fixing", async () => {
    expect(await bodyOf(reject())).toContain("autofocus");
  });

  it("does not reintroduce the retired full option on errors", async () => {
    expect(await bodyOf(reject(true))).not.toContain('name="full"');
  });

  it("still answers 422 — only the body moved, not the contract", async () => {
    expect((await reject()).status).toBe(422);
  });
});

describe("finishing a registration", () => {
  async function succeed() {
    const form = new FormData();
    form.set("url", "https://example.com/feed.xml");
    const app = webApp();
    const result = await app.request("/register", { method: "POST", body: form });
    return bodyOf(app.request(result.headers.get("location") ?? ""));
  }

  it("redirects a successful POST to its addressable result", async () => {
    const result = await postRegister(webApp(), "?lang=ko");
    expect(result.status).toBe(303);
    expect(result.headers.get("location")).toBe("/registered/example?created=1&lang=ko");
  });

  it("keeps the feed and outcome when switching language without registering again", async () => {
    let registrations = 0;
    const app = webApp({
      registerFeed: {
        execute: async () => {
          registrations += 1;
          return ok({ feed: FEED, created: true });
        },
      },
    });
    const result = await postRegister(app, "?lang=ko");
    const html = await bodyOf(app.request(result.headers.get("location") ?? ""));
    expect(html).toContain('href="/registered/example?created=1&amp;lang=ja"');
    const switched = await app.request("/registered/example?created=1&lang=ja");
    expect(await switched.text()).toContain("@example@rss2.test");
    expect(registrations).toBe(1);
  });

  it("answers 404 for malformed or missing result handles", async () => {
    expect((await webApp().request("/registered/bad.handle")).status).toBe(404);
    expect((await webApp().request("/registered/missing")).status).toBe(404);
  });

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
  it("isolates feed-supplied text from surrounding localized chrome", async () => {
    const html = await bodyOf(webApp().request("/"));
    expect(html).toContain('<bdi dir="auto">Example Blog</bdi>');
    expect(html).toContain('<bdi dir="ltr">example.com/feed.xml</bdi>');
  });

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
    expect(parseHTML(html).document.querySelector("[data-pending-form] .btn-spinner")?.getAttribute("aria-hidden"))
      .toBe("true");
  });

  it("localizes the waiting label", async () => {
    const html = await bodyOf(webApp().request("/?lang=ko"));
    expect(html).toContain('data-pending-label="등록하는 중…"');
  });

  it("gives the wait a live region that starts empty", async () => {
    const html = await bodyOf(webApp().request("/"));
    // Empty until the submission starts: an announced region with text in it
    // would speak on load, before there is anything to report.
    const status = parseHTML(html).document.querySelector("[data-pending-status]");
    expect(status?.getAttribute("role")).toBe("status");
    expect(status?.textContent).toBe("");
  });
});

describe("the account name to copy", () => {
  async function registered() {
    const form = new FormData();
    form.set("url", "https://example.com/feed.xml");
    const app = webApp();
    const result = await app.request("/register", { method: "POST", body: form });
    return bodyOf(app.request(result.headers.get("location") ?? ""));
  }

  it("copies the whole address, and breaks it only at the host", async () => {
    const html = await registered();
    expect(html).toContain('data-copy="@example@rss2.test"');
    // <wbr> is a break opportunity, not a character: the copied and selected
    // text are unchanged, but a narrow screen wraps at the address's seam
    // instead of mid-domain.
    const { document } = parseHTML(html);
    const handle = document.querySelector(".copy-row .handle");
    expect(handle?.textContent).toBe("@example@rss2.test");
    expect(handle?.querySelector("wbr")).not.toBeNull();
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
