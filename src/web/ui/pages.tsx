import type { I18n, MessageDescriptor } from "@lingui/core";
import type { FC, PropsWithChildren } from "hono/jsx";
import { Feed } from "../../domain/feed/feed.js";
import type { PopularFeed } from "../../domain/ports/feed-repository.js";
import { translate, translateWithSlots } from "../i18n.js";
import {
  LOCALE_LABELS,
  type Locale,
  neutralLocalePath,
  SUPPORTED_LOCALES,
  switchLocalePath,
} from "../locale.js";
import { copy } from "./messages.js";

const RSS_ICON_PATH =
  "M6.18 15.64a2.18 2.18 0 1 1 0 4.36 2.18 2.18 0 0 1 0-4.36zM4 10.1v3.12c3.74 0 6.78 3.04 6.78 6.78h3.12c0-5.47-4.43-9.9-9.9-9.9zM4 4.44v3.12c6.86 0 12.44 5.58 12.44 12.44H19.56C19.56 11.4 12.6 4.44 4 4.44z";

const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#ea580c" d="${RSS_ICON_PATH}"/></svg>`,
)}`;

const STYLE = `
  :root {
    color-scheme: light dark;
    --bg: #fcfcfb;
    --surface: #f2f1ef;
    --text: #1c1b19;
    --muted: #6d6a64;
    --line: #e5e3df;
    --accent: #c2410c;
    --accent-strong: #9a3412;
    --on-accent: #ffffff;
    --danger: #b42318;
    --danger-bg: #fef3f2;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #161514;
      --surface: #211f1d;
      --text: #edeae6;
      --muted: #a39e97;
      --line: #363330;
      --accent: #fb923c;
      --accent-strong: #fdac6d;
      --on-accent: #2b1602;
      --danger: #f97066;
      --danger-bg: #2d1a18;
    }
  }
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
    background: var(--bg); color: var(--text);
    margin: 0 auto; max-width: 42rem; line-height: 1.6;
    padding: 2rem max(1.25rem, env(safe-area-inset-right)) 5rem
      max(1.25rem, env(safe-area-inset-left));
  }
  h1, h2 { text-wrap: balance; }
  a { color: var(--accent); }
  a:focus-visible, button:focus-visible, input:focus-visible {
    outline: 2px solid var(--text); outline-offset: 2px;
  }
  header.site { margin-bottom: 2.5rem; }
  header.site h1 { margin: 0 0 0.4rem; font-size: 1.5rem; letter-spacing: -0.02em; }
  header.site h1 a {
    color: inherit; text-decoration: none;
    display: inline-flex; align-items: center; gap: 0.45rem;
  }
  .logo { width: 1.1em; height: 1.1em; color: var(--accent); flex: none; }
  header.site p { margin: 0; color: var(--muted); font-size: 0.95rem; }
  .chip {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85em; color: var(--text);
    background: var(--surface); border: 1px solid var(--line);
    border-radius: 0.375rem; padding: 0.05rem 0.35rem;
    overflow-wrap: anywhere;
  }
  nav.lang {
    margin-top: 0.85rem; display: flex; gap: 0.9rem;
    font-size: 0.875rem;
  }
  nav.lang a { color: var(--muted); }
  nav.lang [aria-current] { color: var(--text); font-weight: 500; }
  h2 { font-size: 1rem; font-weight: 600; margin: 0 0 0.65rem; }
  main > section + section { margin-top: 2.25rem; }
  form.row { display: flex; gap: 0.5rem; }
  form.row input {
    flex: 1; min-width: 0; min-height: 2.75rem;
    padding: 0.55rem 0.85rem; font: inherit; font-size: 1rem;
    color: inherit; background: var(--bg);
    border: 1px solid var(--line); border-radius: 0.625rem;
    appearance: none; -webkit-appearance: none;
  }
  form.row input::placeholder { color: var(--muted); }
  form.row button {
    min-height: 2.75rem; padding: 0.55rem 1.1rem;
    font: inherit; font-size: 1rem; font-weight: 500;
    background: var(--accent); color: var(--on-accent);
    border: none; border-radius: 0.625rem; cursor: pointer;
    transition: background-color 0.15s ease;
  }
  @media (hover: hover) {
    form.row button:hover { background: var(--accent-strong); }
  }
  form.row button:active { transform: scale(0.97); }
  @media (max-width: 26rem) {
    form.row { flex-wrap: wrap; }
    form.row button { flex: 1; }
  }
  ul.feeds { list-style: none; margin: 0; padding: 0; }
  ul.feeds li { padding: 0.85rem 0; border-bottom: 1px solid var(--line); }
  ul.feeds li:last-child { border-bottom: none; }
  .feed-top {
    display: flex; align-items: baseline;
    justify-content: space-between; gap: 0.75rem;
  }
  .handle {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.9rem; color: var(--accent); overflow-wrap: anywhere;
  }
  .badge {
    font-variant-numeric: tabular-nums;
    font-size: 0.85rem; color: var(--muted); flex: none;
  }
  .feed-title { font-weight: 500; margin-top: 0.1rem; }
  .meta { color: var(--muted); font-size: 0.875rem; margin: 0.1rem 0 0; }
  .feed-url { overflow-wrap: anywhere; }
  .notice {
    padding: 0.85rem 1rem; border-radius: 0.625rem;
    background: var(--surface); border: 1px solid var(--line);
  }
  .notice.error {
    background: var(--danger-bg); color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 35%, transparent);
  }
  .empty { color: var(--muted); }
  .sr-only {
    position: absolute; width: 1px; height: 1px;
    padding: 0; margin: -1px; overflow: hidden;
    clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }
  @media (prefers-reduced-motion: reduce) {
    * { transition-duration: 0.01ms !important; }
  }
`;

/** Everything a page needs that isn't its own data. Passed as one `ctx` prop. */
export type PageContext = {
  /** Origin of this deployment, e.g. `https://rss2.pub` — for absolute links. */
  readonly origin: string;
  /** Host part of the origin (may include a port) — renders as @handle@host. */
  readonly host: string;
  readonly i18n: I18n;
  readonly locale: Locale;
  /**
   * GET-addressable path the locale links point at. Deliberately NOT "where
   * the user is": on a POST result page it is `/`, because the current URL
   * cannot be re-entered with a different language. Don't reuse it for
   * og:url or active-nav highlighting.
   */
  readonly switcherPath: string;
};

const SITE_NAME = "rss2.pub";

const localeUrl = (ctx: PageContext, locale: Locale): string =>
  `${ctx.origin}${switchLocalePath(ctx.switcherPath, locale)}`;

const LocaleNav: FC<{ ctx: PageContext }> = (props) => (
  <nav
    class="lang"
    aria-label={translate(props.ctx.i18n, copy.layoutLanguageLabel)}
  >
    {SUPPORTED_LOCALES.map((locale) =>
      locale === props.ctx.locale ? (
        <span aria-current="true" lang={locale}>
          {LOCALE_LABELS[locale]}
        </span>
      ) : (
        <a
          href={switchLocalePath(props.ctx.switcherPath, locale)}
          lang={locale}
          hreflang={locale}
        >
          {LOCALE_LABELS[locale]}
        </a>
      ),
    )}
  </nav>
);

const Layout: FC<
  PropsWithChildren<{ ctx: PageContext; title?: MessageDescriptor }>
> = (props) => (
  <html lang={props.ctx.locale}>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta
        name="description"
        content={translate(props.ctx.i18n, copy.layoutMetaDescription)}
      />
      <title>
        {props.title === undefined
          ? SITE_NAME
          : `${translate(props.ctx.i18n, props.title)} · ${SITE_NAME}`}
      </title>
      {/* Crawlers ignore hreflang on ordinary links, so the translations are
          only discoverable through these. x-default is the negotiating URL. */}
      <link rel="canonical" href={localeUrl(props.ctx, props.ctx.locale)} />
      {SUPPORTED_LOCALES.map((locale) => (
        <link
          rel="alternate"
          hreflang={locale}
          href={localeUrl(props.ctx, locale)}
        />
      ))}
      <link
        rel="alternate"
        hreflang="x-default"
        href={`${props.ctx.origin}${neutralLocalePath(props.ctx.switcherPath)}`}
      />
      <link rel="icon" href={FAVICON} />
      <style>{STYLE}</style>
    </head>
    <body>
      <header class="site">
        <h1>
          <a href="/">
            <svg class="logo" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d={RSS_ICON_PATH} />
            </svg>
            {SITE_NAME}
          </a>
        </h1>
        <p>
          {translateWithSlots(props.ctx.i18n, copy.layoutTagline, {
            handle: <span class="chip">@rss2pub@{props.ctx.host}</span>,
            command: <code class="chip">register &lt;url&gt;</code>,
          })}
        </p>
        <LocaleNav ctx={props.ctx} />
      </header>
      <main>{props.children}</main>
    </body>
  </html>
);

const SearchForm: FC<{ ctx: PageContext; query?: string }> = (props) => (
  <form class="row" method="get" action="/search">
    <label class="sr-only" for="search-q">
      {translate(props.ctx.i18n, copy.searchLabel)}
    </label>
    <input
      id="search-q"
      type="search"
      name="q"
      placeholder={translate(props.ctx.i18n, copy.searchPlaceholder)}
      value={props.query ?? ""}
      spellcheck={false}
      autocomplete="off"
    />
    <button type="submit">{translate(props.ctx.i18n, copy.searchButton)}</button>
  </form>
);

const RegisterForm: FC<{ ctx: PageContext }> = (props) => (
  <form class="row" method="post" action="/register">
    <label class="sr-only" for="register-url">
      {translate(props.ctx.i18n, copy.registerUrlLabel)}
    </label>
    <input
      id="register-url"
      type="url"
      name="url"
      placeholder="https://example.com/feed.xml"
      required
      spellcheck={false}
      autocomplete="off"
      autocapitalize="off"
    />
    <button type="submit">
      {translate(props.ctx.i18n, copy.registerButton)}
    </button>
  </form>
);

const FeedLine: FC<{
  ctx: PageContext;
  feed: Feed;
  followers?: number;
}> = (props) => (
  <li>
    <div class="feed-top">
      <span class="handle">
        @{props.feed.handle}@{props.ctx.host}
      </span>
      {props.followers !== undefined && (
        <span class="badge">
          {translate(props.ctx.i18n, copy.feedFollowers, {
            count: props.followers,
          })}
        </span>
      )}
    </div>
    <div class="feed-title">{Feed.displayName(props.feed)}</div>
    {props.feed.description !== null && (
      <p class="meta">{props.feed.description}</p>
    )}
    <div class="meta feed-url">{props.feed.url}</div>
  </li>
);

export const HomePage: FC<{ ctx: PageContext; popular: PopularFeed[] }> = (
  props,
) => (
  <Layout ctx={props.ctx}>
    <section>
      <h2>{translate(props.ctx.i18n, copy.registerHeading)}</h2>
      <RegisterForm ctx={props.ctx} />
    </section>
    <section>
      <h2>{translate(props.ctx.i18n, copy.searchHeading)}</h2>
      <SearchForm ctx={props.ctx} />
    </section>
    <section>
      <h2>{translate(props.ctx.i18n, copy.homePopularHeading)}</h2>
      {props.popular.length === 0 ? (
        <p class="empty">{translate(props.ctx.i18n, copy.homePopularEmpty)}</p>
      ) : (
        <ul class="feeds">
          {props.popular.map((entry) => (
            <FeedLine
              ctx={props.ctx}
              feed={entry.feed}
              followers={entry.followerCount}
            />
          ))}
        </ul>
      )}
    </section>
  </Layout>
);

export const SearchPage: FC<{
  ctx: PageContext;
  query: string;
  results: Feed[];
}> = (props) => (
  <Layout ctx={props.ctx} title={copy.searchHeading}>
    <section>
      <h2>{translate(props.ctx.i18n, copy.searchHeading)}</h2>
      <SearchForm ctx={props.ctx} query={props.query} />
    </section>
    <section>
      {props.results.length === 0 ? (
        <p class="notice">
          {translate(props.ctx.i18n, copy.searchEmpty, { query: props.query })}
        </p>
      ) : (
        <ul class="feeds">
          {props.results.map((feed) => (
            <FeedLine ctx={props.ctx} feed={feed} />
          ))}
        </ul>
      )}
    </section>
  </Layout>
);

export const RegisterResultPage: FC<{
  ctx: PageContext;
  outcome:
    | { kind: "created" | "exists"; feed: Feed }
    | { kind: "error"; message: string };
}> = (props) => (
  <Layout ctx={props.ctx} title={copy.registerResultHeading}>
    <section>
      <h2>{translate(props.ctx.i18n, copy.registerResultHeading)}</h2>
      {props.outcome.kind === "error" ? (
        <p class="notice error">{props.outcome.message}</p>
      ) : (
        <>
          <p class="notice">
            {translateWithSlots(
              props.ctx.i18n,
              props.outcome.kind === "created"
                ? copy.registerResultCreated
                : copy.registerResultExists,
              {
                handle: (
                  <span class="chip">
                    @{props.outcome.feed.handle}@{props.ctx.host}
                  </span>
                ),
              },
            )}
          </p>
          <ul class="feeds">
            <FeedLine ctx={props.ctx} feed={props.outcome.feed} />
          </ul>
        </>
      )}
    </section>
    <p>
      <a href="/">{translate(props.ctx.i18n, copy.registerBackHome)}</a>
    </p>
  </Layout>
);
