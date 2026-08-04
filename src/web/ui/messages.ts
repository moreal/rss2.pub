import type { MessageDescriptor } from "@lingui/core";

/**
 * Every user-facing string in the web UI.
 *
 * Named `copy` rather than `msg` on purpose: `msg` is the Lingui macro import
 * that ADR-0008 rules out, and a reader shouldn't have to check which one this
 * is. Each descriptor carries a `/*i18n*\/` annotation so `yarn i18n:extract`
 * picks it up without macros — this toolchain (tsx + tsc) has no babel step.
 *
 * IDs are `<area>.<name>`: exactly two dot-separated segments, dashes inside a
 * segment. The camelCase key is the same words, so key and id derive from each
 * other mechanically. Messages use ICU MessageFormat; placeholders filled with
 * plain strings go through `translate()`, placeholders filled with rendered
 * elements go through `translateWithSlots()`.
 */
export const copy = {
  layoutMetaDescription: /*i18n*/ {
    id: "layout.meta-description",
    message: "Follow RSS and Atom feeds from the fediverse.",
  },
  layoutTagline: /*i18n*/ {
    id: "layout.tagline",
    message:
      "Follow RSS and Atom feeds from the fediverse. Mention {handle} with {command} or use the form below.",
    comment:
      "{handle} renders as the @rss2pub@host chip; {command} renders as the `register <url>` chip.",
  },
  layoutLanguageLabel: /*i18n*/ {
    id: "layout.language-label",
    message: "Language",
    comment: "Accessible label of the language switcher.",
  },
  registerHeading: /*i18n*/ {
    id: "register.heading",
    message: "Register a feed",
  },
  registerUrlLabel: /*i18n*/ {
    id: "register.url-label",
    message: "Feed URL",
  },
  registerButton: /*i18n*/ {
    id: "register.button",
    message: "Register feed",
  },
  searchHeading: /*i18n*/ {
    id: "search.heading",
    message: "Search",
  },
  searchLabel: /*i18n*/ {
    id: "search.label",
    message: "Search registered feeds",
  },
  searchPlaceholder: /*i18n*/ {
    id: "search.placeholder",
    message: "Search registered feeds…",
  },
  searchButton: /*i18n*/ {
    id: "search.button",
    message: "Search",
  },
  searchEmpty: /*i18n*/ {
    id: "search.empty",
    message:
      "No feeds matched “{query}”. Register it from the home page or via the bot.",
    comment:
      "Shown on the search page, which has no registration form of its own.",
  },
  homePopularHeading: /*i18n*/ {
    id: "home.popular-heading",
    message: "Most followed feeds",
  },
  homePopularEmpty: /*i18n*/ {
    id: "home.popular-empty",
    message: "No feeds yet — register the first one!",
  },
  feedFollowers: /*i18n*/ {
    id: "feed.followers",
    message: "{count, plural, one {# follower} other {# followers}}",
  },
  registerResultHeading: /*i18n*/ {
    id: "register.result-heading",
    message: "Feed registration",
  },
  registerResultCreated: /*i18n*/ {
    id: "register.result-created",
    message:
      "Registered! Follow {handle} from your fediverse account to get new posts.",
    comment: "{handle} renders as the @feed@host chip.",
  },
  registerResultExists: /*i18n*/ {
    id: "register.result-exists",
    message:
      "Already registered — follow {handle} from your fediverse account to get new posts.",
    comment: "{handle} renders as the @feed@host chip.",
  },
  registerErrorMissingUrl: /*i18n*/ {
    id: "register.error-missing-url",
    message: "Missing feed URL.",
  },
  registerErrorNotAUrl: /*i18n*/ {
    id: "register.error-not-a-url",
    message: "That doesn’t look like a URL: {url}",
  },
  registerErrorUnsupportedProtocol: /*i18n*/ {
    id: "register.error-unsupported-protocol",
    message: "Only http(s) feeds are supported (got {protocol}).",
  },
  registerErrorFeedUnreachable: /*i18n*/ {
    id: "register.error-feed-unreachable",
    message: "Couldn’t read a feed there: {message}",
  },
  registerBackHome: /*i18n*/ {
    id: "register.back-home",
    message: "← Back to home",
  },
  // `as const` is load-bearing, not decoration: `translate()` reads each
  // message's literal text to decide whether ICU values are mandatory, and
  // plain `satisfies` would widen it to `string` and silently disable that
  // check. A unit test asserts the literals survive.
} as const satisfies Record<string, MessageDescriptor>;
