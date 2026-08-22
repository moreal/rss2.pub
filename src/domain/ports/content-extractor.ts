import type { Result } from "../../shared/result.js";

export type ExtractedContent = {
  readonly contentHtml: string;
};

export type ExtractContentError =
  | {
      readonly type: "RequestFailed";
      readonly url: string;
      readonly message: string;
    }
  | {
      readonly type: "ExtractionFailed";
      readonly url: string;
      readonly message: string;
    };

/**
 * Fetches an item's original article page and extracts its main content
 * (ADR-0009) — only invoked for feeds that opted into `fullContentEnabled`.
 * A failure here (blocked, paywalled, no article found) is not fatal: the
 * caller falls back to the feed-provided teaser.
 */
export type ContentExtractor = {
  extract(url: string): Promise<Result<ExtractedContent, ExtractContentError>>;
};
