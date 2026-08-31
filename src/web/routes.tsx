import { Hono } from "hono";
// Context's env parameter defaults to `any`; naming Env keeps c.get() checked
// against hono/language's ContextVariableMap augmentation.
import type { Context, Env, MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { languageDetector } from "hono/language";
import type { RegisterFeed } from "../application/register-feed.js";
import type {
  ListPopularFeeds,
  SearchFeeds,
} from "../application/search-feeds.js";
import type { PopularFeed } from "../domain/ports/feed-repository.js";
import { i18nFor } from "./i18n.js";
import {
  DEFAULT_LOCALE,
  LOCALE_QUERY_PARAM,
  SUPPORTED_LOCALES,
  resolveLocale,
} from "./locale.js";
import type { PageContext } from "./ui/layout.js";
import {
  type RegisterFailure,
  registerErrorMessage,
} from "./ui/register-error.js";
import {
  HomePage,
  RegisterResultPage,
  type SearchState,
  SearchPage,
} from "./ui/pages.js";

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
 * re-registers the middleware as `/*` on the parent, so every federation route
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

/**
 * How many of the most-followed feeds the home page shows. The list is the
 * page's discovery section, not its purpose — twenty rows of it buried the
 * footer and pushed the registration form off a phone's first two screens —
 * so the home page shows a screenful and /search holds the rest.
 */
const HOME_POPULAR_LIMIT = 8;

/**
 * The home page's list plus whether anything was left out of it. One extra
 * row is fetched and dropped so that question is answered by the data rather
 * than inferred from a full page of results, which cannot tell "eight feeds
 * exist" from "eight of forty".
 */
async function homePopular(
  deps: WebDeps,
): Promise<{ popular: PopularFeed[]; morePopular: boolean }> {
  const feeds = await deps.listPopularFeeds.execute(HOME_POPULAR_LIMIT + 1);
  return {
    popular: feeds.slice(0, HOME_POPULAR_LIMIT),
    morePopular: feeds.length > HOME_POPULAR_LIMIT,
  };
}

/**
 * What /search should render for a query. The switch is total on purpose: a
 * new `SearchFeedsError` variant becomes a compile error here rather than
 * silently rendering the browse state for a failure that isn't one.
 */
async function searchState(
  deps: WebDeps,
  query: string,
): Promise<SearchState> {
  const result = await deps.searchFeeds.execute(query);
  if (result.ok) return { kind: "results", query, results: result.value };
  switch (result.error.type) {
    case "EmptyQuery":
      // Nobody has asked anything yet. That is not a failed search, so the
      // page browses what there is instead of reporting an absence.
      return { kind: "browse", popular: await deps.listPopularFeeds.execute() };
  }
}

/** Human-facing routes. Federation routes are mounted around this app. */
export function createWebRoutes(deps: WebDeps): Hono {
  const app = new Hono();

  app.get("/", negotiateLocale, async (c) => {
    const { popular, morePopular } = await homePopular(deps);
    return c.html(
      <HomePage
        ctx={pageContext(c, deps)}
        popular={popular}
        morePopular={morePopular}
      />,
    );
  });

  app.get("/search", negotiateLocale, async (c) => {
    const state = await searchState(deps, c.req.query("q") ?? "");
    return c.html(<SearchPage ctx={pageContext(c, deps)} state={state} />);
  });

  /**
   * Registration is a POST-to-the-same-page form: a rejected submission
   * re-renders the home page with the URL still in the field, the reason
   * attached to it, and focus moved there — rather than a dead-end result
   * page the user has to back out of and retype into. Status codes are
   * unchanged (400 malformed, 422 rejected), so nothing but the body moves.
   */
  app.post("/register", negotiateLocale, async (c) => {
    const ctx = pageContext(c, deps);
    const form = await c.req.formData();
    const rawUrl = form.get("url");
    const fullContentEnabled = form.get("full") !== null;
    const rejected = async (
      failure: RegisterFailure,
      status: ContentfulStatusCode,
    ) => {
      const { popular, morePopular } = await homePopular(deps);
      return c.html(
        <HomePage
          ctx={ctx}
          popular={popular}
          morePopular={morePopular}
          draft={{
            url: typeof rawUrl === "string" ? rawUrl : "",
            fullContentEnabled,
            error: registerErrorMessage(ctx.i18n, failure),
          }}
        />,
        status,
      );
    };

    if (typeof rawUrl !== "string") {
      return rejected({ type: "MissingUrl" }, 400);
    }
    const result = await deps.registerFeed.execute(rawUrl, fullContentEnabled);
    if (!result.ok) return rejected(result.error, 422);
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
