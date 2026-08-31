import type { AuthorUri } from "../feed/author-uri.js";
import type { Brand } from "../../shared/brand.js";
import { err, ok, type Result } from "../../shared/result.js";

/** Canonical HTTP(S) ID of an object confirmed to be an ActivityPub Actor. */
export type ResolvedActorUri = Brand<string, "ResolvedActorUri">;

export type InvalidResolvedActorUri =
  | { readonly type: "NotAUrl"; readonly raw: string }
  | {
      readonly type: "UnsupportedProtocol";
      readonly raw: string;
      readonly protocol: string;
    };

export const ResolvedActorUri = {
  create(
    raw: string,
  ): Result<ResolvedActorUri, InvalidResolvedActorUri> {
    let parsed: URL;
    try {
      parsed = new URL(raw.trim());
    } catch {
      return err({ type: "NotAUrl", raw });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return err({
        type: "UnsupportedProtocol",
        raw,
        protocol: parsed.protocol,
      });
    }
    return ok(parsed.href as ResolvedActorUri);
  },
} as const;

export type ActorLookupError = {
  readonly type: "ActorLookupFailed";
  readonly uri: AuthorUri;
  readonly message: string;
};

export type ActorResolver = {
  resolve(
    uri: AuthorUri,
  ): Promise<Result<ResolvedActorUri | null, ActorLookupError>>;
};
