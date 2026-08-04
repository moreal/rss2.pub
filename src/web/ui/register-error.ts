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
      return translate(i18n, copy.registerErrorFeedUnreachable, {
        message: failure.message,
      });
  }
}
