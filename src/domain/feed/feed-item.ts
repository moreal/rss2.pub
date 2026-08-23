import type { Brand } from "../../shared/brand.js";
import { err, isOk, ok, type Result } from "../../shared/result.js";
import { sha256Hex } from "../../shared/sha256.js";
import { FeedLanguage } from "./feed-language.js";

/**
 * Duplicate-suppression identity of an item within one feed. Precedence:
 * guid > link > content hash (PLAN.md). Prefixes keep the namespaces disjoint.
 */
export type ItemKey = Brand<string, "ItemKey">;

/** Raw item exactly as a FeedFetcher adapter handed it over — unvalidated. */
export type RawFeedItem = {
  readonly guid: string | null;
  readonly link: string | null;
  readonly title: string | null;
  readonly contentHtml: string | null;
  readonly summaryHtml: string | null;
  readonly publishedAt: Date | null;
  /** Raw BCP-47 tag from the entry's own `xml:lang` (Atom only — ADR-0011).
   * RSS items never carry one; the feed-level language applies instead. */
  readonly language: string | null;
};

export type FeedItem = {
  readonly key: ItemKey;
  readonly title: string | null;
  readonly link: string | null;
  readonly contentHtml: string;
  readonly summaryHtml: string | null;
  readonly publishedAt: Date | null;
  readonly language: FeedLanguage | null;
};

export type UnidentifiableItem = { readonly type: "UnidentifiableItem" };

function normalize(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length === 0 ? null : trimmed;
}

/** Malformed `xml:lang` values are dropped rather than failing the item. */
function parseLanguage(raw: string | null): FeedLanguage | null {
  if (raw === null) return null;
  const result = FeedLanguage.create(raw);
  return isOk(result) ? result.value : null;
}

export const FeedItem = {
  fromRaw(raw: RawFeedItem): Result<FeedItem, UnidentifiableItem> {
    const guid = normalize(raw.guid);
    const link = normalize(raw.link);
    const title = normalize(raw.title);
    const contentHtml = normalize(raw.contentHtml);
    const summaryHtml = normalize(raw.summaryHtml);

    let key: string;
    if (guid !== null) {
      key = `guid:${guid}`;
    } else if (link !== null) {
      key = `link:${link}`;
    } else if (title !== null || contentHtml !== null || summaryHtml !== null) {
      key = `hash:${sha256Hex(`${title ?? ""}\n${contentHtml ?? summaryHtml ?? ""}`)}`;
    } else {
      return err({ type: "UnidentifiableItem" });
    }

    return ok({
      key: key as ItemKey,
      title,
      link,
      contentHtml: contentHtml ?? summaryHtml ?? "",
      summaryHtml,
      publishedAt: raw.publishedAt,
      language: parseLanguage(raw.language),
    });
  },
} as const;
