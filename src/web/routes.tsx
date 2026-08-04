import { Hono } from "hono";
// Context's env parameter defaults to `any`; naming Env keeps c.get() checked
// against hono/language's ContextVariableMap augmentation.
import type { Context, Env, MiddlewareHandler } from "hono";
import { languageDetector } from "hono/language";
import type { RegisterFeed } from "../application/register-feed.js";
import type {
  ListPopularFeeds,
  SearchFeeds,
} from "../application/search-feeds.js";
import { i18nFor } from "./i18n.js";
import {
  DEFAULT_LOCALE,
  LOCALE_QUERY_PARAM,
  SUPPORTED_LOCALES,
  resolveLocale,
} from "./locale.js";
import type { PageContext } from "./ui/layout.js";
import { registerErrorMessage } from "./ui/register-error.js";
import { HomePage, RegisterResultPage, SearchPage } from "./ui/pages.js";

export type WebDeps = {
  /** Public origin, e.g. `https://rss2.pub` — absolute links are built on it. */
  readonly origin: string;
  /** Host part of the origin (may include a port) — renders as @handle@host. */
  readonly host: string;
  readonly registerFeed: RegisterFeed;
  readonly searchFeeds: SearchFeeds;
  readonly listPopularFeeds: ListPopularFeeds;
  /** Liveness/readiness of downstream dependencies (database, poller). */
  readonly ready: () => Promise<boolean>;
};

/**
 * Per-request rendering context. Requires `detectLanguage` to have run —
 * without it the language falls back to the default and pages serve English.
 */
function pageContext(c: Context<Env>, deps: WebDeps): PageContext {
  const locale = resolveLocale(c.get("language"));
  const url = new URL(c.req.url);
  return {
    origin: deps.origin,
    host: deps.host,
    locale,
    i18n: i18nFor(locale),
    // Only GET pages are addressable, so a POST result page points the
    // switcher home instead of at a URL that would re-submit the form.
    switcherPath: c.req.method === "GET" ? `${url.pathname}${url.search}` : "/",
  };
}

/**
 * Applied per HTML route on purpose. An app-wide `use()` here would not stay
 * inside this app: app.ts mounts it with `app.route("/", web)`, which
 * re-registers the middleware as `/*` on the parent, so every BotKit route
 * (WebFinger, /ap/*) would answer with a language Set-Cookie too. Verified,
 * not theoretical — don't "simplify" this into `app.use(detectLanguage)`.
 */
const detectLanguage = languageDetector({
  supportedLanguages: [...SUPPORTED_LOCALES],
  fallbackLanguage: DEFAULT_LOCALE,
  // Hono's own prefix fallback maps ko-KR → ko, and its defaults already
  // order querystring over cookie over Accept-Language.
  order: ["querystring", "cookie", "header"],
  lookupQueryString: LOCALE_QUERY_PARAM,
  lookupCookie: LOCALE_QUERY_PARAM,
  // Merged over hono's defaults, which add Secure — so the switcher does not
  // persist on plain-HTTP origins other than localhost.
  cookieOptions: { sameSite: "Lax" },
});

/**
 * Marks a response as locale-negotiated. Without `Vary`, any shared cache in
 * front of this app would serve one visitor's language to everyone else.
 */
const negotiateLocale: MiddlewareHandler = async (c, next) => {
  await detectLanguage(c, next);
  c.header("Vary", "Accept-Language, Cookie");
};

/** Human-facing routes. Federation routes are mounted around this app. */
export function createWebRoutes(deps: WebDeps): Hono {
  const app = new Hono();

  app.get("/", negotiateLocale, async (c) => {
    const popular = await deps.listPopularFeeds.execute();
    return c.html(
      <HomePage ctx={pageContext(c, deps)} popular={popular} />,
    );
  });

  app.get("/search", negotiateLocale, async (c) => {
    const query = c.req.query("q") ?? "";
    const result = await deps.searchFeeds.execute(query);
    const results = result.ok ? result.value : [];
    return c.html(
      <SearchPage ctx={pageContext(c, deps)} query={query} results={results} />,
    );
  });

  app.post("/register", negotiateLocale, async (c) => {
    const ctx = pageContext(c, deps);
    const form = await c.req.formData();
    const rawUrl = form.get("url");
    if (typeof rawUrl !== "string") {
      return c.html(
        <RegisterResultPage
          ctx={ctx}
          outcome={{
            kind: "error",
            message: registerErrorMessage(ctx.i18n, { type: "MissingUrl" }),
          }}
        />,
        400,
      );
    }
    const result = await deps.registerFeed.execute(rawUrl);
    if (!result.ok) {
      return c.html(
        <RegisterResultPage
          ctx={ctx}
          outcome={{
            kind: "error",
            message: registerErrorMessage(ctx.i18n, result.error),
          }}
        />,
        422,
      );
    }
    return c.html(
      <RegisterResultPage
        ctx={ctx}
        outcome={{
          kind: result.value.created ? "created" : "exists",
          feed: result.value.feed,
        }}
      />,
    );
  });

  app.get("/healthz", (c) => c.json({ status: "ok" }));

  app.get("/readyz", async (c) => {
    const ready = await deps.ready();
    return c.json({ status: ready ? "ok" : "unavailable" }, ready ? 200 : 503);
  });

  return app;
}
