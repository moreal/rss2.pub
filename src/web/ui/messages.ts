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
    message: "Follow Atom and RSS 2.0 feeds from the fediverse.",
  },
  layoutLanguageLabel: /*i18n*/ {
    id: "layout.language-label",
    message: "Language",
    comment: "Accessible label of the language switcher.",
  },
  layoutSkipLink: /*i18n*/ {
    id: "layout.skip-link",
    message: "Skip to main content",
    comment: "First tab stop on every page; visible only while focused.",
  },
  layoutNavLabel: /*i18n*/ {
    id: "layout.nav-label",
    message: "Site",
    comment: "Accessible label of the primary navigation.",
  },
  layoutNavHome: /*i18n*/ {
    id: "layout.nav-home",
    message: "Home",
  },
  layoutNavSearch: /*i18n*/ {
    id: "layout.nav-search",
    message: "Search",
  },
  layoutFooterSummary: /*i18n*/ {
    id: "layout.footer-summary",
    message: "rss2.pub turns feeds into fediverse accounts anyone can follow.",
  },
  layoutFooterBot: /*i18n*/ {
    id: "layout.footer-bot",
    message: "Bot account: {handle}",
    comment: "{handle} renders as a link to the @rss2pub account page.",
  },
  layoutFooterSource: /*i18n*/ {
    id: "layout.footer-source",
    message: "Source code",
  },
  homeHeading: /*i18n*/ {
    id: "home.heading",
    message: "Follow any Atom or RSS 2.0 feed from the fediverse",
  },
  homeLede: /*i18n*/ {
    id: "home.lede",
    message:
      "Register a feed and it becomes a fediverse account. Follow that account from Mastodon or any other app and every new post arrives in your timeline.",
  },
  homePopularEmptyHint: /*i18n*/ {
    id: "home.popular-empty-hint",
    message: "Register the first one with the form above.",
  },
  registerHeading: /*i18n*/ {
    id: "register.heading",
    message: "Register a feed",
  },
  registerUrlLabel: /*i18n*/ {
    id: "register.url-label",
    message: "Feed URL",
  },
  registerUrlHelp: /*i18n*/ {
    id: "register.url-help",
    message:
      "The address of the Atom or RSS 2.0 feed itself, not the website — it often ends in /atom, /feed, or .xml.",
  },
  registerButton: /*i18n*/ {
    id: "register.button",
    message: "Register feed",
  },
  registerPending: /*i18n*/ {
    id: "register.pending",
    message: "Registering…",
    comment:
      "Replaces the submit button's label while the feed is being fetched.",
  },
  registerBotAlt: /*i18n*/ {
    id: "register.bot-alt",
    message: "Prefer the fediverse? Mention {handle} with {command}.",
    comment:
      "{handle} renders as the @rss2pub@host chip; {command} renders as the `register <url>` chip.",
  },
  registerErrorHeading: /*i18n*/ {
    id: "register.error-heading",
    message: "That feed could not be registered",
  },
  registerErrorHint: /*i18n*/ {
    id: "register.error-hint",
    message:
      "Open the address in a browser to check it returns a feed rather than a web page, then try again.",
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
    message: "Couldn’t read an Atom or RSS 2.0 feed there: {message}",
  },
  registerResultHeading: /*i18n*/ {
    id: "register.result-heading",
    message: "Feed registration",
  },
  registerResultCreatedTitle: /*i18n*/ {
    id: "register.result-created-title",
    message: "Feed registered",
  },
  registerResultCreated: /*i18n*/ {
    id: "register.result-created",
    message: "This feed now publishes as its own fediverse account.",
  },
  registerResultExistsTitle: /*i18n*/ {
    id: "register.result-exists-title",
    message: "Already registered",
  },
  registerResultExists: /*i18n*/ {
    id: "register.result-exists",
    message: "This feed already publishes as its own fediverse account.",
  },
  registerNextHeading: /*i18n*/ {
    id: "register.next-heading",
    message: "Follow it from your fediverse account",
  },
  registerNextCopy: /*i18n*/ {
    id: "register.next-copy",
    message: "Copy this account name.",
  },
  registerNextFollow: /*i18n*/ {
    id: "register.next-follow",
    message:
      "Paste it into the search box of Mastodon — or whichever app you use — and press Follow.",
  },
  registerCopyButton: /*i18n*/ {
    id: "register.copy-button",
    message: "Copy",
  },
  registerCopied: /*i18n*/ {
    id: "register.copied",
    message: "Copied",
  },
  registerOpenProfile: /*i18n*/ {
    id: "register.open-profile",
    message: "Open the account page",
  },
  registerAnother: /*i18n*/ {
    id: "register.another",
    message: "Register another feed",
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
    message: "rust, weather, example.com",
    comment:
      "Example queries. Deliberately not a restatement of the field's label.",
  },
  searchHelp: /*i18n*/ {
    id: "search.help",
    message: "Type part of a feed’s name, description, or address.",
    comment: "Help text under the search field.",
  },
  searchButton: /*i18n*/ {
    id: "search.button",
    message: "Search",
  },
  searchResultsCount: /*i18n*/ {
    id: "search.results-count",
    message:
      "{count, plural, one {# feed matches “{query}”} other {# feeds match “{query}”}}",
    comment: "Announced to screen readers when results load.",
  },
  searchEmptyTitle: /*i18n*/ {
    id: "search.empty-title",
    message: "No feeds matched “{query}”",
  },
  searchEmptyHint: /*i18n*/ {
    id: "search.empty-hint",
    message:
      "Only feeds someone has already registered are searchable. Try a shorter keyword, or register this one yourself.",
  },
  searchEmptyAction: /*i18n*/ {
    id: "search.empty-action",
    message: "Register a feed",
  },
  feedPopularHeading: /*i18n*/ {
    id: "feed.popular-heading",
    message: "Most followed feeds",
    comment: "Heading of the popular-feed list on the home and search pages.",
  },
  feedPopularEmpty: /*i18n*/ {
    id: "feed.popular-empty",
    message: "No feeds registered yet",
  },
  feedPopularMore: /*i18n*/ {
    id: "feed.popular-more",
    message: "See more feeds",
    comment:
      "Link from the home page's shortened list to the full one on /search.",
  },
  feedFollowers: /*i18n*/ {
    id: "feed.followers",
    message: "{count, plural, one {# follower} other {# followers}}",
  },
  federationPostFallback: /*i18n*/ {
    id: "federation.post-fallback",
    message: "Post",
    comment: "Fallback title for an untitled Note on an actor page.",
  },
  federationViewOriginal: /*i18n*/ {
    id: "federation.view-original",
    message: "View original",
  },
  federationMainActorSummary: /*i18n*/ {
    id: "federation.main-actor-summary",
    message:
      "I turn Atom and RSS 2.0 feeds into followable accounts. Mention me with register or search commands.",
  },
  federationNoPostsTitle: /*i18n*/ {
    id: "federation.no-posts-title",
    message: "No posts yet",
  },
  federationNoPostsBody: /*i18n*/ {
    id: "federation.no-posts-body",
    message: "Posts appear here after the next poll of the feed.",
  },
  federationRemoteFollowLabel: /*i18n*/ {
    id: "federation.remote-follow-label",
    message: "Follow from your Fediverse account",
    comment: "Label of the remote-follow form on a bridged feed's actor page.",
  },
  federationRemoteFollowPlaceholder: /*i18n*/ {
    id: "federation.remote-follow-placeholder",
    message: "you@instance.social",
    comment: "Example account shown as the remote-follow input's placeholder.",
  },
  federationRemoteFollowButton: /*i18n*/ {
    id: "federation.remote-follow-button",
    message: "Follow",
  },
  federationRemoteFollowTitle: /*i18n*/ {
    id: "federation.remote-follow-title",
    message: "Remote follow",
    comment:
      "Heading and page title of the remote-follow validation-error page.",
  },
  federationRemoteFollowInvalidAccount: /*i18n*/ {
    id: "federation.remote-follow-invalid-account",
    message: "Enter a valid Fediverse account, like you@instance.social.",
  },
  federationBackToActor: /*i18n*/ {
    id: "federation.back-to-actor",
    message: "Back to {name}",
  },
  // `as const` is load-bearing, not decoration: `translate()` reads each
  // message's literal text to decide whether ICU values are mandatory, and
  // plain `satisfies` would widen it to `string` and silently disable that
  // check. A unit test asserts the literals survive.
} as const satisfies Record<string, MessageDescriptor>;
