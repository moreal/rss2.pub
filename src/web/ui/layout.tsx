import type { I18n, MessageDescriptor } from "@lingui/core";
import type { FC, PropsWithChildren } from "hono/jsx";
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
    --bg: #f8f7f4;
    --surface: #fffefa;
    --surface-muted: #f0eee9;
    --text: #201e1b;
    --muted: #68645e;
    --line: #dedbd4;
    --accent: #c2410c;
    --accent-strong: #9a3412;
    --on-accent: #ffffff;
    --danger: #b42318;
    --danger-bg: #fef3f2;
    --focus: #201e1b;
    --shadow-panel: 0 1px 2px rgb(45 39 31 / 6%),
      0 12px 32px rgb(45 39 31 / 5%);
    --ease-out-expo: cubic-bezier(0.19, 1, 0.22, 1);
    --ease-out-quad: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #141311;
      --surface: #1d1b18;
      --surface-muted: #25221e;
      --text: #f0ede8;
      --muted: #aaa49c;
      --line: #38342f;
      --accent: #fb923c;
      --accent-strong: #fdac6d;
      --on-accent: #2b1602;
      --danger: #f97066;
      --danger-bg: #2d1a18;
      --focus: #f0ede8;
      --shadow-panel: 0 1px 2px rgb(0 0 0 / 22%),
        0 18px 44px rgb(0 0 0 / 18%);
    }
  }
  * { box-sizing: border-box; }
  html { min-height: 100%; background: var(--bg); }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
    background: var(--bg); color: var(--text);
    margin: 0 auto; max-width: 46rem; line-height: 1.55;
    padding: clamp(1.5rem, 5vw, 3.5rem)
      max(1.25rem, env(safe-area-inset-right))
      calc(5rem + env(safe-area-inset-bottom))
      max(1.25rem, env(safe-area-inset-left));
  }
  h1, h2 { text-wrap: balance; }
  a, button, input { touch-action: manipulation; }
  a { color: var(--accent); text-underline-offset: 0.16em; }
  a:focus-visible, button:focus-visible, input:focus-visible {
    outline: 2px solid var(--focus); outline-offset: 3px;
  }
  header.site { margin-bottom: clamp(2rem, 6vw, 3.25rem); }
  header.site h1 {
    margin: 0 0 0.55rem; font-size: clamp(1.65rem, 5vw, 2rem);
    line-height: 1.15; letter-spacing: -0.035em;
  }
  header.site h1 a {
    color: inherit; text-decoration: none;
    display: inline-flex; align-items: center; gap: 0.5rem;
    min-height: 2.75rem;
  }
  .logo { width: 1em; height: 1em; color: var(--accent); flex: none; }
  header.site p {
    margin: 0; max-width: 64ch; color: var(--muted); font-size: 0.95rem;
  }
  .chip {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85em; color: var(--text);
    background: var(--surface-muted); box-shadow: inset 0 0 0 1px var(--line);
    border-radius: 0.375rem; padding: 0.05rem 0.35rem;
    overflow-wrap: anywhere;
  }
  nav.lang {
    margin-top: 1rem; display: flex; align-items: center; gap: 0.25rem;
    font-size: 0.875rem; min-height: 2.75rem;
  }
  nav.lang a, nav.lang span {
    display: inline-flex; align-items: center; min-height: 2.75rem;
    padding: 0 0.65rem; border-radius: 999px;
  }
  nav.lang a { color: var(--muted); }
  nav.lang [aria-current] {
    color: var(--text); background: var(--surface-muted); font-weight: 500;
  }
  h2 {
    font-size: 0.95rem; font-weight: 650; letter-spacing: -0.01em;
    margin: 0 0 0.75rem;
  }
  main { display: grid; gap: 1rem; }
  main section {
    padding: clamp(1rem, 3vw, 1.25rem);
    background: var(--surface); border-radius: 1rem;
    box-shadow: inset 0 0 0 1px var(--line), var(--shadow-panel);
  }
  main section + section { margin-top: 0; }
  form.row { display: flex; gap: 0.625rem; }
  form.row input {
    flex: 1; min-width: 0; min-height: 2.75rem;
    padding: 0.6rem 0.8rem; font: inherit; font-size: 1rem;
    color: inherit; background: var(--bg);
    border: 1px solid var(--line); border-radius: 0.7rem;
    appearance: none; -webkit-appearance: none;
    transition: border-color 120ms ease;
  }
  form.row input::placeholder { color: var(--muted); }
  form.row input:focus { border-color: var(--text); }
  form.row button {
    min-height: 2.75rem; padding: 0.55rem 1.1rem;
    font: inherit; font-size: 1rem; font-weight: 500;
    background: var(--accent); color: var(--on-accent);
    border: none; border-radius: 0.7rem; cursor: pointer;
    box-shadow: inset 0 -1px rgb(0 0 0 / 12%);
    transition: background-color 120ms ease,
      transform 150ms var(--ease-out-quad);
  }
  @media (hover: hover) and (pointer: fine) {
    form.row input:hover {
      border-color: color-mix(in srgb, var(--muted) 55%, var(--line));
    }
    form.row button:hover { background: var(--accent-strong); }
  }
  form.row button:active { transform: scale(0.97); }
  @media (max-width: 32rem) {
    form.row { flex-direction: column; }
    form.row button { width: 100%; }
  }
  ul.feeds { list-style: none; margin: 0; padding: 0; }
  ul.feeds li {
    padding: 1rem 0; border-bottom: 1px solid var(--line);
  }
  ul.feeds li:first-child { padding-top: 0.2rem; }
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
  @media (max-width: 32rem) {
    .feed-top { display: block; }
    .badge { display: block; margin-top: 0.15rem; }
  }
  .feed-title { font-weight: 500; margin-top: 0.1rem; }
  .meta { color: var(--muted); font-size: 0.875rem; margin: 0.1rem 0 0; }
  .feed-url { overflow-wrap: anywhere; }
  .notice {
    margin: 0; padding: 0.9rem 1rem; border-radius: 0.75rem;
    background: var(--surface-muted); box-shadow: inset 0 0 0 1px var(--line);
  }
  .notice.error {
    background: var(--danger-bg); color: var(--danger);
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--danger) 35%, transparent);
  }
  .empty { color: var(--muted); }
  .back-link { margin: 0.35rem 0 0; padding: 0 0.25rem; }
  .back-link a {
    display: inline-flex; align-items: center; min-height: 2.75rem;
  }
  .sr-only {
    position: absolute; width: 1px; height: 1px;
    padding: 0; margin: -1px; overflow: hidden;
    clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }
  @media (prefers-reduced-motion: no-preference) {
    main section, .back-link {
      animation: enter 280ms var(--ease-out-expo) both;
    }
    main section:nth-child(2) { animation-delay: 45ms; }
    main section:nth-child(3) {
      animation-name: fade-in; animation-delay: 75ms;
    }
    .back-link { animation-delay: 60ms; }
  }
  @keyframes enter {
    from { opacity: 0; transform: translateY(0.45rem); }
    to { opacity: 1; transform: translateY(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    main section, .back-link {
      animation: fade-in 160ms ease both;
    }
    form.row button { transition-property: background-color; }
    form.row button:active { transform: none; }
  }
  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
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

export const Layout: FC<
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
