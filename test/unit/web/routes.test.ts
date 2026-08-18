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
  const searchFeeds: SearchFeeds = { execute: async () => ok([]) };
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
    expect(html).toContain("main section, .back-link");
    expect(html).toContain("@media (prefers-reduced-motion: reduce)");
    expect(html).not.toContain("main &gt; section");
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
    expect(html).toContain("“없는피드”에 해당하는 피드가 없습니다.");
  });

  it("escapes user input echoed into a localized notice", async () => {
    const html = await bodyOf(webApp().request("/search?q=%3Cscript%3E&lang=ko"));
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
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
    expect(html).toContain('<p class="meta">a blog about examples</p>');
  });

  it("renders a blank query as an empty search rather than failing", async () => {
    const res = await webApp().request("/search?lang=ko");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("“”에 해당하는 피드가 없습니다.");
  });
});

describe("registration outcomes", () => {
  async function postRegister(app: ReturnType<typeof webApp>, query = "") {
    const form = new FormData();
    form.set("url", "https://example.com/feed.xml");
    return app.request(`/register${query}`, { method: "POST", body: form });
  }

  it.each([
    { created: true, expected: "등록되었습니다!" },
    { created: false, expected: "이미 등록된 피드입니다." },
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
