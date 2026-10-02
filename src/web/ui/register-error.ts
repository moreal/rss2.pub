import type { I18n } from "@lingui/core";
import type { RegisterFeedError } from "../../application/register-feed.js";
import { translate } from "../i18n.js";
import { copy } from "./messages.js";

/**
 * Everything that can stop a registration, including the malformed submission
 * the use case never sees.
 */
export type RegisterFailure =
  | RegisterFeedError
  | { readonly type: "MissingUrl" };

/**
 * Total mapping from failure to the sentence the user reads. No `default`
 * branch on purpose: a new failure variant becomes a compile error (TS2366)
 * rather than silently rendering someone else's copy.
 */
export function registerErrorMessage(
  i18n: I18n,
  failure: RegisterFailure,
): string {
  switch (failure.type) {
    case "MissingUrl":
      return translate(i18n, copy.registerErrorMissingUrl);
    case "NotAUrl":
      return translate(i18n, copy.registerErrorNotAUrl, { url: failure.raw });
    case "UnsupportedProtocol":
      return translate(i18n, copy.registerErrorUnsupportedProtocol, {
        // URL.protocol keeps its trailing colon ("ftp:"); drop it for prose.
        protocol: failure.protocol.replace(/:$/, ""),
      });
    case "FeedUnreachable":
      return translate(i18n, failure.reason === "timeout" ? copy.registerTimeoutMessage
        : failure.reason === "network" ? copy.registerNetworkMessage : copy.registerNoFeedMessage);
    case "MultipleFeeds":
      return translate(i18n, copy.registerSelectHelp);
    case "MastodonFeed":
      return translate(i18n, copy.registerErrorMastodonFeed);
    case "FeedBlocked":
      return translate(i18n, copy.registerErrorFeedBlocked);
    case "RegistrationUnavailable":
      return translate(i18n, copy.registerErrorUnavailable);
  }
}

/** Recovery advice matches the failure, rather than asking everyone to retype a URL. */
export function registerErrorHint(i18n: I18n, failure: RegisterFailure): string {
  switch (failure.type) {
    case "RegistrationUnavailable":
      return failure.retryAfterSeconds === null ? translate(i18n, copy.registerCapacityHint)
        : translate(i18n, copy.registerRetryHint, { minutes: Math.max(1, Math.ceil(failure.retryAfterSeconds / 60)) });
    case "FeedBlocked": return translate(i18n, copy.registerBlockedHint);
    case "MastodonFeed": return translate(i18n, copy.registerMastodonHint);
    case "FeedUnreachable": return translate(i18n, failure.reason === "timeout" ? copy.registerTimeoutHint
      : failure.reason === "network" ? copy.registerNetworkHint : copy.registerFormatHint);
    case "MissingUrl": case "NotAUrl": case "UnsupportedProtocol": case "MultipleFeeds":
      return translate(i18n, copy.registerFormatHint);
  }
}
export function registerErrorAction(i18n: I18n, failure: RegisterFailure): { readonly href: string; readonly label: string } | undefined {
  switch (failure.type) {
    case "MastodonFeed": return failure.accountUrl === undefined ? undefined
      : { href: failure.accountUrl, label: translate(i18n, copy.registerOriginalAccount) };
    case "FeedUnreachable": return { href: failure.url, label: translate(i18n, copy.registerOpenSource) };
    case "RegistrationUnavailable": return failure.retryAfterSeconds === null
      ? { href: "/search", label: translate(i18n, copy.searchHeading) } : undefined;
    default: return undefined;
  }
}
