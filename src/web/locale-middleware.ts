import type { Env, MiddlewareHandler } from "hono";
import { languageDetector } from "hono/language";
import {
  DEFAULT_LOCALE,
  LOCALE_QUERY_PARAM,
  matchLocale,
  SUPPORTED_LOCALES,
} from "./locale.js";

/**
 * Applied per HTML route on purpose, never as an app-wide `use()`: mounting
 * a Hono sub-app with `app.route("/", subApp)` re-registers its middleware
 * as `/*` on the parent, so an app-wide `use(detectLanguage)` here would
 * make every other route under the parent - including federation protocol
 * endpoints like WebFinger and `/ap/*` - answer with a language Set-Cookie
 * too. Verified, not theoretical - apply this per route instead.
 */
const detectLanguage = languageDetector({
  supportedLanguages: [...SUPPORTED_LOCALES],
  fallbackLanguage: DEFAULT_LOCALE,
  // Hono's prefix fallback cannot map zh-TW to the distinct zh-Hant-TW
  // catalog. Normalize BCP 47 script/region aliases before its exact match.
  convertDetectedLanguage: (value) => matchLocale(value) ?? value,
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
 *
 * Shared by the product UI (src/web/routes.ts) and the federation
 * actor/remote-follow pages (src/web/federation-pages.tsx) so both surfaces
 * apply the exact same query → cookie → Accept-Language negotiation instead
 * of maintaining two copies that could drift.
 */
export const negotiateLocale: MiddlewareHandler<Env> = async (c, next) => {
  await detectLanguage(c, next);
  c.header("Vary", "Accept-Language, Cookie");
};
