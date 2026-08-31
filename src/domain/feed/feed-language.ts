import type { Brand } from "../../shared/brand.js";
import { err, ok, type Result } from "../../shared/result.js";

/**
 * BCP-47 language tag from Atom `xml:lang`. Normalized via `Intl.Locale`
 * (case-canonicalized `baseName`,
 * Unicode extension subtags dropped) so equal languages compare equal
 * regardless of how the source feed wrote them.
 */
export type FeedLanguage = Brand<string, "FeedLanguage">;

export type InvalidFeedLanguage = {
  readonly type: "InvalidFeedLanguage";
  readonly raw: string;
};

export const FeedLanguage = {
  create(raw: string): Result<FeedLanguage, InvalidFeedLanguage> {
    const normalized = raw.trim().replace(/_/g, "-");
    if (normalized.length === 0) {
      return err({ type: "InvalidFeedLanguage", raw });
    }
    try {
      return ok(new Intl.Locale(normalized).baseName as FeedLanguage);
    } catch {
      return err({ type: "InvalidFeedLanguage", raw });
    }
  },
} as const;
