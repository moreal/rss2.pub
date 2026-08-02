import { Hono } from "hono";
import type { RegisterFeed } from "../application/register-feed.js";
import type {
  ListPopularFeeds,
  SearchFeeds,
} from "../application/search-feeds.js";
import { HomePage, RegisterResultPage, SearchPage } from "./ui/pages.js";

export type WebDeps = {
  readonly host: string;
  readonly registerFeed: RegisterFeed;
  readonly searchFeeds: SearchFeeds;
  readonly listPopularFeeds: ListPopularFeeds;
  /** Liveness/readiness of downstream dependencies (database, poller). */
  readonly ready: () => Promise<boolean>;
};

/** Human-facing routes. Federation routes are mounted around this app. */
export function createWebRoutes(deps: WebDeps): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    const popular = await deps.listPopularFeeds.execute();
    return c.html(<HomePage host={deps.host} popular={popular} />);
  });

  app.get("/search", async (c) => {
    const query = c.req.query("q") ?? "";
    const result = await deps.searchFeeds.execute(query);
    const results = result.ok ? result.value : [];
    return c.html(
      <SearchPage host={deps.host} query={query} results={results} />,
    );
  });

  app.post("/register", async (c) => {
    const form = await c.req.formData();
    const rawUrl = form.get("url");
    if (typeof rawUrl !== "string") {
      return c.html(
        <RegisterResultPage
          host={deps.host}
          outcome={{ kind: "error", message: "Missing feed URL." }}
        />,
        400,
      );
    }
    const result = await deps.registerFeed.execute(rawUrl);
    if (!result.ok) {
      const message =
        result.error.type === "NotAUrl"
          ? `That doesn't look like a URL: ${rawUrl}`
          : result.error.type === "UnsupportedProtocol"
            ? `Only http(s) feeds are supported (got ${result.error.protocol}).`
            : `Couldn't read a feed there: ${result.error.message}`;
      return c.html(
        <RegisterResultPage
          host={deps.host}
          outcome={{ kind: "error", message }}
        />,
        422,
      );
    }
    return c.html(
      <RegisterResultPage
        host={deps.host}
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
