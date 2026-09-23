/**
 * The locale set, free of any catalog import so `lingui.config.ts` can be the
 * same list as the runtime — adding a locale here is the single edit that
 * drives extraction, compilation, and serving.
 */
export const SUPPORTED_LOCALES = [
  "en",
  "ko",
  "ja",
  "zh-Hans-CN",
  "zh-Hant-TW",
  "de",
  "fr",
  "es",
  "it",
  "nl",
  "pl",
  "pt-PT",
] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE = "en" satisfies Locale;

/** Written by the switcher, read by the detector — one name, two sides. */
export const LOCALE_QUERY_PARAM = "lang";

/** Native names stay in their own script in every language picker. */
export const LOCALE_META: Record<
  Locale,
  { readonly label: string; readonly shortLabel: string; readonly direction: "ltr" | "rtl" }
> = {
  en: { label: "English", shortLabel: "EN", direction: "ltr" },
  ko: { label: "한국어", shortLabel: "KO", direction: "ltr" },
  ja: { label: "日本語", shortLabel: "JA", direction: "ltr" },
  "zh-Hans-CN": { label: "简体中文", shortLabel: "ZH-CN", direction: "ltr" },
  "zh-Hant-TW": { label: "繁體中文（台灣）", shortLabel: "ZH-TW", direction: "ltr" },
  de: { label: "Deutsch", shortLabel: "DE", direction: "ltr" },
  fr: { label: "Français", shortLabel: "FR", direction: "ltr" },
  es: { label: "Español", shortLabel: "ES", direction: "ltr" },
  it: { label: "Italiano", shortLabel: "IT", direction: "ltr" },
  nl: { label: "Nederlands", shortLabel: "NL", direction: "ltr" },
  pl: { label: "Polski", shortLabel: "PL", direction: "ltr" },
  "pt-PT": { label: "Português (Portugal)", shortLabel: "PT", direction: "ltr" },
};

/** Match a BCP 47 request tag to a catalog without losing Chinese script. */
export function matchLocale(value: string): Locale | null {
  const tag = value.trim().replaceAll("_", "-").toLowerCase();
  const exact = SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === tag);
  if (exact !== undefined) return exact;
  const parts = tag.split("-");
  const base = parts[0];
  if (base === "zh") {
    if (parts.includes("hans")) return "zh-Hans-CN";
    if (parts.includes("hant")) return "zh-Hant-TW";
    return parts.some((part) => ["tw", "hk", "mo"].includes(part))
      ? "zh-Hant-TW"
      : "zh-Hans-CN";
  }
  if (base === "pt") return "pt-PT";
  return SUPPORTED_LOCALES.find((locale) => locale === base) ?? null;
}

/** Unknown input falls back to the default; callers always receive a catalog. */
export function resolveLocale(value: string): Locale {
  return matchLocale(value) ?? DEFAULT_LOCALE;
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
