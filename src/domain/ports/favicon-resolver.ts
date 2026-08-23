import type { Result } from "../../shared/result.js";

export type ResolvedFavicon = { readonly iconUrl: string };

export type ResolveFaviconError =
  | {
      readonly type: "RequestFailed";
      readonly url: string;
      readonly message: string;
    }
  | {
      readonly type: "NotFound";
      readonly url: string;
    };

/**
 * Discovers the favicon/icon of a website — the feed channel's own link, not
 * the feed document itself (ADR-0010) — so a registered feed's actor can
 * carry a recognizable avatar. Best-effort: PollFeed treats any error as "no
 * icon yet" and retries on a later poll rather than failing the poll.
 */
export type FaviconResolver = {
  resolve(pageUrl: string): Promise<Result<ResolvedFavicon, ResolveFaviconError>>;
};
