import type { MessageDescriptor } from "@lingui/core";
import { raw } from "hono/html";
import type { FC, PropsWithChildren } from "hono/jsx";
import {
  hydrationBootstrap,
  renderLocalePicker,
  serializeLocalePickerProps,
  type LocalePickerProps,
} from "@rss2pub/web-ui/server";
import { translate, translateWithSlots } from "../i18n.js";
import type { PageContext } from "../page-context.js";
import {
  LOCALE_META,
  type Locale,
  neutralLocalePath,
  SUPPORTED_LOCALES,
  switchLocalePath,
} from "../locale.js";
import { RSS_ICON_PATH, RssIcon } from "./icons.js";
import { copy } from "./messages.js";
import { COPY_SCRIPT, PENDING_SCRIPT, STYLE } from "./styles.js";
import { webUiAssetUrls } from "./solid-assets.js";

const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#ea580c" d="${RSS_ICON_PATH}"/></svg>`,
)}`;

const SITE_NAME = "rss2.pub";

const SOURCE_URL = "https://github.com/moreal/rss2.pub";

/**
 * Username of the static command actor. Duplicated from federation identity
 * rather than imported so this UI leaf does not pull infrastructure into its
 * module graph for one string.
 */
const MAIN_ACTOR_HANDLE = "rss2pub";

/** Which primary-nav entry is the page the user is on, if any. */
export type NavKey = "home" | "search";

const localeUrl = (ctx: PageContext, locale: Locale): string =>
  `${ctx.origin}${switchLocalePath(ctx.switcherPath, locale)}`;

const LocaleNav: FC<{ ctx: PageContext }> = (props) => {
  const pickerProps: LocalePickerProps = {
    currentLocale: props.ctx.locale,
    currentShortLabel: LOCALE_META[props.ctx.locale].shortLabel,
    buttonLabel: translate(props.ctx.i18n, copy.layoutLanguageLabel),
    options: SUPPORTED_LOCALES.map((locale) => ({
      locale,
      label: LOCALE_META[locale].label,
      href: switchLocalePath(props.ctx.switcherPath, locale),
    })),
  };
  return (
  <nav
    class="lang"
    aria-label={pickerProps.buttonLabel}
  >
    <div id="picker" hidden>{raw(renderLocalePicker(pickerProps))}</div>
    <script type="application/json" id="picker-props">
      {raw(serializeLocalePickerProps(pickerProps))}
    </script>
    <details id="picker-fallback" class="lang-picker">
      <summary
        aria-label={`${pickerProps.buttonLabel}: ${LOCALE_META[props.ctx.locale].label}`}
      >
        <span aria-hidden="true">{pickerProps.currentShortLabel}</span>
        <span class="lang-caret" aria-hidden="true">▾</span>
      </summary>
      <div class="lang-options">
        {pickerProps.options.map((option) =>
          option.locale === pickerProps.currentLocale ? (
            <span aria-current="true" lang={option.locale}>
              {option.label}
            </span>
          ) : (
            <a
              href={option.href}
              lang={option.locale}
              hreflang={option.locale}
            >
              {option.label}
            </a>
          ),
        )}
      </div>
    </details>
  </nav>
  );
};

const SiteNav: FC<{ ctx: PageContext; nav?: NavKey | undefined }> = (
  props,
) => (
  <nav
    class="site-nav"
    aria-label={translate(props.ctx.i18n, copy.layoutNavLabel)}
  >
    <a href="/" {...(props.nav === "home" ? { "aria-current": "page" } : {})}>
      {translate(props.ctx.i18n, copy.layoutNavHome)}
    </a>
    <a
      href="/search"
      {...(props.nav === "search" ? { "aria-current": "page" } : {})}
    >
      {translate(props.ctx.i18n, copy.layoutNavSearch)}
    </a>
  </nav>
);

const SiteFooter: FC<{ ctx: PageContext }> = (props) => (
  <footer class="site-footer">
    <div class="shell footer-inner">
      <p>{translate(props.ctx.i18n, copy.layoutFooterSummary)}</p>
      <p class="footer-links">
        <span>
          {translateWithSlots(props.ctx.i18n, copy.layoutFooterBot, {
            handle: (
              <a href={`/@${MAIN_ACTOR_HANDLE}`}>
                @{MAIN_ACTOR_HANDLE}@{props.ctx.host}
              </a>
            ),
          })}
        </span>
        <a href={SOURCE_URL} rel="noopener">
          {translate(props.ctx.i18n, copy.layoutFooterSource)}
        </a>
      </p>
    </div>
  </footer>
);

export const Layout: FC<
  PropsWithChildren<{
    ctx: PageContext;
    title?: MessageDescriptor | string | undefined;
    nav?: NavKey | undefined;
    enter?: boolean | undefined;
  }>
> = (props) => (
  <html lang={props.ctx.locale} dir={LOCALE_META[props.ctx.locale].direction}>
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
          : `${typeof props.title === "string"
            ? props.title
            : translate(props.ctx.i18n, props.title)} · ${SITE_NAME}`}
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
      {webUiAssetUrls !== null && <link rel="stylesheet" href={webUiAssetUrls.style} />}
      {/* raw(): Hono escapes `"`, `<`, `>` and `&` in text children, which
          would corrupt quoted font names and child selectors. */}
      <style>{raw(STYLE)}</style>
    </head>
    <body>
      <a class="skip" href="#main">
        {translate(props.ctx.i18n, copy.layoutSkipLink)}
      </a>
      <header class="site">
        <div class="shell site-inner">
          <a class="brand" href="/">
            <RssIcon class="brand-mark" size={20} />
            <span class="brand-name">{SITE_NAME}</span>
          </a>
          <SiteNav ctx={props.ctx} nav={props.nav} />
          <LocaleNav ctx={props.ctx} />
        </div>
      </header>
      <main id="main" class="shell" data-enter={props.enter || undefined}>
        {props.children}
      </main>
      <SiteFooter ctx={props.ctx} />
      {/* raw() for the same reason as the stylesheet: an escaped `&&` or
          `<` would break both of these silently. */}
      <script>{raw(COPY_SCRIPT)}</script>
      <script>{raw(PENDING_SCRIPT)}</script>
      {raw(hydrationBootstrap())}
      {webUiAssetUrls !== null && <script type="module" src={webUiAssetUrls.script} />}
    </body>
  </html>
);
