import type { Brand } from "../../shared/brand.js";
import { err, ok, type Result } from "../../shared/result.js";

/**
 * Absolute http(s) URL of a feed actor's avatar image, resolved from the
 * channel link's favicon/icon (ADR-0010). Unlike FeedUrl this is a rendering
 * hint, not an identity key, so it is validated but not canonicalized.
 */
export type IconUrl = Brand<string, "IconUrl">;

export type InvalidIconUrl =
  | { readonly type: "NotAUrl"; readonly raw: string }
  | {
      readonly type: "UnsupportedProtocol";
      readonly raw: string;
      readonly protocol: string;
    };

export const IconUrl = {
  create(raw: string): Result<IconUrl, InvalidIconUrl> {
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
    return ok(parsed.href as IconUrl);
  },
} as const;
