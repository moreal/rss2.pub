import type { Brand } from "../../shared/brand.js";
import { err, ok, type Result } from "../../shared/result.js";

/**
 * Resolves the correct remote-follow ("subscribe") URL for a visitor's
 * Fediverse account, so the actor page can redirect them to the endpoint
 * their own instance actually advertises rather than a guessed one.
 *
 * Mastodon-compatible software advertises this through WebFinger's
 * `http://ostatus.org/schema/1.0/subscribe` link relation (see
 * https://docs.joinmastodon.org/spec/webfinger/). Guessing a bare
 * `https://<domain>/authorize_interaction` from the account's domain alone
 * breaks for split-domain instances (where the web UI and WebFinger
 * subject live on different hosts) and for software using a different
 * follow endpoint.
 */
export type RemoteFollowError =
  | { readonly type: "InvalidAccount"; readonly raw: string }
  | { readonly type: "NoSubscribeTemplate"; readonly account: string }
  | {
      readonly type: "LookupFailed";
      readonly account: string;
      readonly message: string;
    };

/**
 * A visitor-entered Fediverse account, normalized to `user@ascii-domain`
 * (internationalized domains are converted to Punycode). Holding this type
 * proves the value is a plausible WebFinger `acct:` subject - no control
 * characters, no embedded URL structure, no more than one `@` - so callers
 * (and {@link RemoteFollowResolver} implementations) never build a
 * WebFinger lookup or redirect Location from unvalidated visitor input.
 */
export type RemoteFollowAccount = Brand<string, "RemoteFollowAccount">;

const ACCOUNT_HOSTNAME_PATTERN =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

/**
 * Characters that must never appear in either half of a visitor-entered
 * `user@domain` account: C0 control characters and DEL (can survive query
 * decoding, e.g. a literal NUL from `acct=alice%40remote.example%00`, and
 * the platform URL parser silently strips or otherwise misparses these
 * rather than rejecting them), URL-structural characters including a
 * backslash (`new URL()` treats a trailing `\\` like `/` for some inputs,
 * so one could otherwise smuggle path syntax into what must stay a bare
 * token), and whitespace.
 */
const UNSAFE_ACCOUNT_CHARS = /[\u0000-\u001f\u007f/?#\\\s]/;

/**
 * Normalizes a visitor-entered domain (which may be an internationalized
 * domain name, e.g. `예시.테스트`) to its ASCII/Punycode form via the
 * platform URL parser - the same normalization the underlying fetch/DNS
 * layer requires - then validates the result's shape. Rejects anything
 * that isn't a bare host (a path, query, fragment, userinfo, or an `@`
 * hiding in what should be one hostname), so a domain segment can never
 * smuggle in extra URL structure.
 */
function normalizeAccountDomain(rawDomain: string): string | null {
  if (rawDomain.length === 0 || UNSAFE_ACCOUNT_CHARS.test(rawDomain)) return null;
  let parsed: URL;
  try {
    parsed = new URL(`https://${rawDomain}`);
  } catch {
    return null;
  }
  if (
    parsed.pathname !== "/"
    || parsed.search !== ""
    || parsed.hash !== ""
    || parsed.username !== ""
    || parsed.password !== ""
  ) {
    return null;
  }
  return ACCOUNT_HOSTNAME_PATTERN.test(parsed.hostname) ? parsed.host : null;
}

export const RemoteFollowAccount = {
  /**
   * Parses a visitor-entered Fediverse account (`user@instance.example` or
   * `@user@instance.example`). A full account is required, not just a
   * domain, because resolving the correct subscribe endpoint means a
   * WebFinger `acct:` lookup, which needs a specific account.
   */
  create(raw: string): Result<RemoteFollowAccount, RemoteFollowError> {
    const trimmed = raw.trim();
    const withoutLeadingAt = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
    const atIndex = withoutLeadingAt.indexOf("@");
    if (atIndex <= 0 || atIndex === withoutLeadingAt.length - 1) {
      return err({ type: "InvalidAccount", raw });
    }
    const user = withoutLeadingAt.slice(0, atIndex);
    const rawDomain = withoutLeadingAt.slice(atIndex + 1);
    if (
      user.includes("@")
      || rawDomain.includes("@")
      || UNSAFE_ACCOUNT_CHARS.test(user)
    ) {
      return err({ type: "InvalidAccount", raw });
    }
    const domain = normalizeAccountDomain(rawDomain);
    return domain === null
      ? err({ type: "InvalidAccount", raw })
      : ok(`${user}@${domain}` as RemoteFollowAccount);
  },

  /** The ASCII/Punycode domain half of an already-validated account. */
  domain(account: RemoteFollowAccount): string {
    return account.slice(account.indexOf("@") + 1);
  },
} as const;

export type RemoteFollowResolver = {
  /**
   * @param account A visitor's Fediverse account, already validated by
   *   {@link RemoteFollowAccount.create}.
   * @param localActorAcct The local actor's own `handle@host` account,
   *   substituted into the discovered subscribe template.
   */
  resolveSubscribeUrl(
    account: RemoteFollowAccount,
    localActorAcct: string,
  ): Promise<Result<URL, RemoteFollowError>>;
};

