/**
 * The locale set, free of any catalog import so `lingui.config.ts` can be the
 * same list as the runtime — adding a locale here is the single edit that
 * drives extraction, compilation, and serving.
 */
export const SUPPORTED_LOCALES = ["en", "ko"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE = "en" satisfies Locale;

/** Written by the switcher, read by the detector — one name, two sides. */
export const LOCALE_QUERY_PARAM = "lang";

/** Native-language names, deliberately never translated. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ko: "한국어",
};

/**
 * Narrows a string `hono/language` has already negotiated against this same
 * list. Unknown input falls back to the default on purpose: content
 * negotiation is *defined* as falling back, and no caller could act on a
 * failure — hence a `Locale`, not a `Result`.
 */
export function resolveLocale(value: string): Locale {
  return SUPPORTED_LOCALES.find((locale) => locale === value) ?? DEFAULT_LOCALE;
}

// Paths arrive without an origin, so parsing needs a base we then discard.
const PARSE_BASE = "http://placeholder.invalid";

const rewriteQuery = (
  pathWithQuery: string,
  edit: (params: URLSearchParams) => void,
): string => {
  const url = new URL(pathWithQuery, PARSE_BASE);
  edit(url.searchParams);
  return `${url.pathname}${url.search}`;
};

/** The same page in another locale — drives the switcher and hreflang links. */
export function switchLocalePath(
  pathWithQuery: string,
  locale: Locale,
): string {
  return rewriteQuery(pathWithQuery, (params) =>
    params.set(LOCALE_QUERY_PARAM, locale),
  );
}

/**
 * The same page with no locale pinned — the URL that negotiates. This is what
 * `hreflang="x-default"` must point at, so it has to strip an existing
 * `?lang=` rather than inherit it from the current request.
 */
export function neutralLocalePath(pathWithQuery: string): string {
  return rewriteQuery(pathWithQuery, (params) =>
    params.delete(LOCALE_QUERY_PARAM),
  );
}
