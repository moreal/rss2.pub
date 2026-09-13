import type { Federation } from "@fedify/fedify";
import type {
  RemoteFollowError,
  RemoteFollowResolver,
} from "../../domain/ports/remote-follow-resolver.js";
import { err, ok } from "../../shared/result.js";

const SUBSCRIBE_REL = "http://ostatus.org/schema/1.0/subscribe";
const LOOKUP_TIMEOUT_MS = 5_000;
const PLACEHOLDER = "{uri}";

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Expands the OStatus subscribe link's `{uri}` placeholder. This
 * deliberately does not implement general RFC 6570 template expansion:
 * every subscribe template observed in the wild (Mastodon, Pleroma,
 * Friendica, GoToSocial) uses the single, literal `{uri}` expression.
 * Returns null - rather than silently emitting a broken but
 * `new URL()`-parseable string - for a template that does not contain that
 * placeholder at all, so the caller can try the next candidate link instead
 * of redirecting somewhere wrong.
 */
function expandSubscribeTemplate(template: string, uri: string): string | null {
  if (!template.includes(PLACEHOLDER)) return null;
  return template.split(PLACEHOLDER).join(encodeURIComponent(uri));
}

/**
 * WebFinger responses are attacker-influenced JSON from whatever server the
 * visitor's account domain points at (Fedify's `lookupWebFinger` parses the
 * body with `response.json()` and does not validate its shape - see
 * `@fedify/webfinger`'s `lookupWebFinger`). Every property is read back out
 * defensively here instead of trusting the declared `ResourceDescriptor`/
 * `Link` TypeScript types, which describe the happy path only.
 *
 * RFC 7033 section 4.4.4 permits more than one link with the same `rel`, so
 * this returns every candidate template in document order rather than only
 * the first, letting the caller skip an earlier candidate that turns out to
 * be unusable (no placeholder, or expands to a non-HTTP(S) URL) instead of
 * giving up on a usable later one.
 */
function findSubscribeTemplates(links: unknown): readonly string[] {
  if (!Array.isArray(links)) return [];
  const templates: string[] = [];
  for (const link of links) {
    if (link === null || typeof link !== "object") continue;
    const candidate = link as { readonly rel?: unknown; readonly template?: unknown };
    if (candidate.rel === SUBSCRIBE_REL && typeof candidate.template === "string") {
      templates.push(candidate.template);
    }
  }
  return templates;
}

/** Expands and validates one candidate template, or null if unusable. */
function resolveCandidate(template: string, uri: string): URL | null {
  const expanded = expandSubscribeTemplate(template, uri);
  if (expanded === null) return null;
  let target: URL;
  try {
    target = new URL(expanded);
  } catch {
    return null;
  }
  return target.protocol === "http:" || target.protocol === "https:"
    ? target
    : null;
}

/**
 * Resolves a visitor's remote-follow target through the same Fedify
 * WebFinger lookup (and its `allowPrivateAddress` SSRF guard) already
 * configured on {@link Federation}, rather than guessing the target
 * software's follow endpoint from the account's bare domain.
 */
export function createFedifyRemoteFollowResolver(deps: {
  readonly federation: Federation<void>;
  readonly origin: string;
}): RemoteFollowResolver {
  const context = deps.federation.createContext(
    new URL(deps.origin),
    undefined,
  );
  return {
    async resolveSubscribeUrl(account, localActorAcct) {
      let descriptor: Awaited<ReturnType<typeof context.lookupWebFinger>>;
      try {
        descriptor = await context.lookupWebFinger(`acct:${account}`, {
          signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
        });
      } catch (cause) {
        const error: RemoteFollowError = {
          type: "LookupFailed",
          account,
          message: messageOf(cause),
        };
        return err(error);
      }
      const templates = findSubscribeTemplates(
        descriptor === null ? undefined : descriptor.links,
      );
      const uri = `acct:${localActorAcct}`;
      for (const template of templates) {
        const target = resolveCandidate(template, uri);
        if (target !== null) return ok(target);
      }
      const error: RemoteFollowError = { type: "NoSubscribeTemplate", account };
      return err(error);
    },
  };
}

