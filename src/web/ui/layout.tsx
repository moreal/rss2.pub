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

export const RSS_ICON_PATH =
  "M6.18 15.64a2.18 2.18 0 1 1 0 4.36 2.18 2.18 0 0 1 0-4.36zM4 10.1v3.12c3.74 0 6.78 3.04 6.78 6.78h3.12c0-5.47-4.43-9.9-9.9-9.9zM4 4.44v3.12c6.86 0 12.44 5.58 12.44 12.44H19.56C19.56 11.4 12.6 4.44 4 4.44z";

const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#ea580c" d="${RSS_ICON_PATH}"/></svg>`,
)}`;

const STYLE = `
  :root {
    color-scheme: light dark;
    --bg: #f4f4f6;
    --surface: #ffffff;
    --surface-muted: color-mix(in srgb, var(--text) 5%, var(--surface));
    --text: #131316;
    --muted: #6c6c76;
    --line: rgb(19 19 22 / 10%);
    --accent: #ea580c;
    --accent-strong: #c2410c;
    --on-accent: #ffffff;
    --danger: #d32f2b;
    --danger-bg: #fef2f1;
    --focus: #131316;
    --radius-sm: 0.5rem;
    --radius-md: 0.625rem;
    --radius-lg: 0.875rem;
    --page-pad: clamp(1.5rem, 5vw, 3.5rem);
    --section-pad: clamp(1rem, 3vw, 1.5rem);
    --font-weight-medium: 500;
    --font-weight-semibold: 650;
    --ease-out-expo: cubic-bezier(0.19, 1, 0.22, 1);
    --ease-out-quad: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0a0a0c;
      --surface: #141417;
      --surface-muted: color-mix(in srgb, white 6%, var(--surface));
      --text: #f2f2f4;
      --muted: #96969f;
      --line: rgb(255 255 255 / 11%);
      --accent: #fb923c;
      --accent-strong: #fdba74;
      --on-accent: #1a0f04;
      --danger: #f2726c;
      --danger-bg: #2a1615;
      --focus: #f2f2f4;
    }
  }
  * { box-sizing: border-box; }
  html { min-height: 100%; background: var(--bg); }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
    background: var(--bg); color: var(--text);
    margin: 0 auto; max-width: 46rem; line-height: 1.55;
    padding: var(--page-pad)
      max(1.25rem, env(safe-area-inset-right))
      calc(var(--page-pad) + env(safe-area-inset-bottom))
      max(1.25rem, env(safe-area-inset-left));
  }
  h1, h2 { text-wrap: balance; }
  a, button, input { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
  a { color: var(--accent); text-underline-offset: 0.16em; }
  a:focus-visible, button:focus-visible, input:focus-visible {
    outline: 2px solid var(--focus); outline-offset: 3px;
  }
  header.site { margin-bottom: clamp(2rem, 6vw, 3.25rem); }
  .site-top {
    display: flex; align-items: center; justify-content: space-between;
    gap: 1rem; flex-wrap: wrap;
  }
  header.site h1 {
    margin: 0; font-size: clamp(1.65rem, 5vw, 2rem);
    font-weight: 700; line-height: 1.15; letter-spacing: -0.04em;
  }
  header.site h1 a {
    color: inherit; text-decoration: none;
    display: inline-flex; align-items: center; gap: 0.5rem;
    min-height: 2.75rem;
  }
  .logo { width: 1em; height: 1em; color: var(--accent); flex: none; }
  header.site p {
    margin: 1rem 0 0; max-width: 64ch; color: var(--muted);
    font-size: 0.95rem;
  }
  .chip {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85em; color: var(--text);
    background: var(--surface-muted); box-shadow: inset 0 0 0 1px var(--line);
    border-radius: var(--radius-sm); padding: 0.05rem 0.4rem;
    overflow-wrap: anywhere;
  }
  nav.lang {
    display: flex; align-items: center; gap: 0.25rem;
    font-size: 0.875rem; min-height: 2.75rem;
  }
  nav.lang a, nav.lang span {
    display: inline-flex; align-items: center; min-height: 2.75rem;
    padding: 0 0.75rem; border-radius: 999px;
  }
  nav.lang a { color: var(--muted); }
  nav.lang [aria-current] {
    color: var(--text); background: var(--surface-muted);
    font-weight: var(--font-weight-medium);
  }
  h2 {
    font-size: 0.95rem; font-weight: var(--font-weight-semibold);
    letter-spacing: -0.01em; margin: 0 0 0.75rem;
  }
  .section-head {
    display: flex; align-items: center; justify-content: space-between;
    gap: 1rem; flex-wrap: wrap; margin-bottom: 0.75rem;
  }
  .section-head h2 { margin: 0; }
  main { display: grid; gap: 1.25rem; }
  main section {
    position: relative;
    padding: var(--section-pad);
    background: var(--surface); border-radius: var(--radius-lg);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  main section.hero {
    background: color-mix(in srgb, var(--accent) 5%, var(--surface));
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--accent) 18%, var(--line));
  }
  form.row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  form.register-form .checkbox-row {
    flex-basis: 100%; display: flex; align-items: center; gap: 0.5rem;
    min-height: 2.75rem; margin: 0 -0.5rem; padding: 0 0.5rem;
    font-size: 0.85rem; color: var(--muted); cursor: pointer;
    border-radius: var(--radius-sm); transition: background-color 120ms ease;
  }
  @media (hover: hover) and (pointer: fine) {
    form.register-form .checkbox-row:hover { background: var(--surface-muted); }
  }
  form.register-form .checkbox-row input {
    flex: none; min-height: 0; width: 1.05rem; height: 1.05rem; margin: 0;
    accent-color: var(--accent);
  }
  form.row input {
    flex: 1; min-width: 0; min-height: 2.75rem;
    padding: 0.625rem 0.75rem; font: inherit; font-size: 1rem;
    color: inherit; background: var(--surface-muted);
    border: 1px solid transparent; border-radius: var(--radius-md);
    appearance: none; -webkit-appearance: none;
    transition: border-color 120ms ease;
  }
  form.row input::placeholder { color: var(--muted); }
  form.row input:focus { border-color: var(--text); }
  form.row button {
    min-height: 2.75rem; padding: 0.625rem 1rem;
    font: inherit; font-size: 1rem; font-weight: var(--font-weight-medium);
    background: var(--accent); color: var(--on-accent);
    border: none; border-radius: var(--radius-md); cursor: pointer;
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
  form.row + .notice, form.row + ul.feeds { margin-top: 1rem; }
  @media (max-width: 32rem) {
    form.row:not(.compact) { flex-direction: column; }
    form.row:not(.compact) button { width: 100%; }
  }
  form.row.compact {
    flex-wrap: nowrap; gap: 0.5rem; max-width: 15rem;
  }
  form.row.compact button {
    flex: none; width: 2.75rem; padding: 0;
    display: grid; place-items: center;
  }
  @media (max-width: 32rem) {
    .section-head { flex-direction: column; align-items: stretch; }
    form.row.compact { max-width: none; }
  }
  ul.feeds { list-style: none; margin: 0; padding: 0; }
  ul.feeds li {
    padding: 1rem 0; border-bottom: 1px solid var(--line);
  }
  ul.feeds li:first-child { padding-top: 0.2rem; }
  ul.feeds li:last-child { border-bottom: none; }
  .feed-card {
    display: block; margin: 0 -0.5rem; padding: 0 0.5rem;
    color: inherit; text-decoration: none; border-radius: var(--radius-sm);
    transition: background-color 120ms ease;
  }
  @media (hover: hover) and (pointer: fine) {
    .feed-card:hover { background: var(--surface-muted); }
  }
  .feed-card:active { background: var(--surface-muted); }
  .feed-row { display: flex; gap: 0.75rem; align-items: flex-start; }
  .feed-main { flex: 1; min-width: 0; }
  .feed-chevron {
    flex: none; align-self: center; color: var(--muted); opacity: 0.4;
    transition: opacity 150ms ease, transform 150ms var(--ease-out-quad);
  }
  @media (hover: hover) and (pointer: fine) {
    .feed-card:hover .feed-chevron { opacity: 1; transform: translateX(2px); }
  }
  @media (prefers-reduced-motion: reduce) {
    .feed-chevron { transition: opacity 150ms ease; }
  }
  .avatar {
    position: relative; flex: none; overflow: hidden;
    width: 2rem; height: 2rem; margin-top: 0.05rem;
    border-radius: 999px; display: grid; place-items: center;
    background: var(--surface-muted); color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .avatar svg { width: 1.05rem; height: 1.05rem; }
  .avatar img {
    position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: cover;
  }
  .feed-top {
    display: flex; align-items: baseline;
    justify-content: space-between; gap: 0.75rem;
  }
  .handle {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.9rem; color: var(--accent); overflow-wrap: anywhere;
  }
  .badges { display: flex; align-items: baseline; gap: 0.375rem; flex: none; }
  .badge {
    font-variant-numeric: tabular-nums;
    font-size: 0.85rem; color: var(--muted); flex: none;
  }
  .badge-full-content {
    padding: 0.1rem 0.375rem; border-radius: var(--radius-sm);
    color: var(--accent); box-shadow: inset 0 0 0 1px var(--line);
  }
  @media (max-width: 32rem) {
    .feed-top { display: block; }
    .badges { display: block; margin-top: 0.15rem; }
    .badge { display: block; width: fit-content; margin-top: 0.15rem; }
  }
  .feed-title {
    font-weight: var(--font-weight-medium); margin-top: 0.1rem;
  }
  .meta { color: var(--muted); font-size: 0.875rem; margin: 0.1rem 0 0; }
  .feed-url { overflow-wrap: anywhere; }
  .notice {
    display: flex; align-items: flex-start; gap: 0.5rem;
    margin: 0; padding: 1rem; border-radius: var(--radius-md);
    background: var(--surface-muted); box-shadow: inset 0 0 0 1px var(--line);
  }
  .notice svg { flex: none; margin-top: 0.15rem; color: var(--accent); }
  .notice.error {
    background: var(--danger-bg); color: var(--danger);
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--danger) 35%, transparent);
  }
  .notice.error svg { color: var(--danger); }
  .empty { color: var(--muted); }
  .back-link { margin: 0; padding: 0 var(--section-pad); }
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
  @view-transition {
    navigation: auto;
  }
  header.site { view-transition-name: site-header; }
  nav.lang [aria-current] { view-transition-name: locale-pill; }
  ::view-transition-old(root), ::view-transition-new(root) {
    animation-duration: 180ms;
    animation-timing-function: var(--ease-out-expo);
  }
  ::view-transition-group(site-header), ::view-transition-group(locale-pill) {
    animation-duration: 220ms;
    animation-timing-function: var(--ease-out-expo);
  }
  @media (prefers-reduced-motion: reduce) {
    ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) {
      animation: none !important;
    }
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
        <div class="site-top">
          <h1>
            <a href="/">
              <svg class="logo" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d={RSS_ICON_PATH} />
              </svg>
              {SITE_NAME}
            </a>
          </h1>
          <LocaleNav ctx={props.ctx} />
        </div>
        <p>
          {translateWithSlots(props.ctx.i18n, copy.layoutTagline, {
            handle: <span class="chip">@rss2pub@{props.ctx.host}</span>,
            command: <code class="chip">register &lt;url&gt;</code>,
          })}
        </p>
      </header>
      <main>{props.children}</main>
    </body>
  </html>
);
