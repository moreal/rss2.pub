import type { I18n } from "@lingui/core";
import type { Context, Env } from "hono";
import { i18nFor } from "./i18n.js";
import { resolveLocale, type Locale } from "./locale.js";

/** Shared request data for the Hono document shell and its translated body. */
export type PageContext = {
  readonly origin: string;
  readonly host: string;
  readonly sourceUrl: string;
  readonly i18n: I18n;
  readonly locale: Locale;
  /** Addressable path used when the reader switches language. */
  readonly switcherPath: string;
};

/** Build the shared document context after locale negotiation. */
export function pageContext(
  c: Context<Env>,
  deployment: { readonly origin: string; readonly host: string; readonly sourceUrl?: string | undefined },
  switcherPath?: string,
): PageContext {
  const locale = resolveLocale(c.get("language"));
  const url = new URL(c.req.url);
  return {
    origin: deployment.origin,
    host: deployment.host,
    sourceUrl: deployment.sourceUrl ?? "https://github.com/moreal/rss2.pub",
    locale,
    i18n: i18nFor(locale),
    switcherPath: switcherPath ?? `${url.pathname}${url.search}`,
  };
}
