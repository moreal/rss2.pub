import type { Brand } from "../../shared/brand.js";
import { err, isOk, ok, type Result } from "../../shared/result.js";
import { sha256Hex } from "../../shared/sha256.js";
import {
  AttributionCandidates,
  type AttributionCandidates as AttributionCandidatesValue,
} from "./author-uri.js";
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
  /** Raw BCP-47 tag from the entry's effective `xml:lang` (ADR-0011). */
  readonly language: string | null;
  /** Raw URIs from the entry's effective Atom authors, in document order. */
  readonly authorUris: readonly string[];
};

export type FeedItem = {
  readonly key: ItemKey;
  readonly title: string | null;
  readonly link: string | null;
  readonly contentHtml: string;
  readonly summaryHtml: string | null;
  readonly publishedAt: Date | null;
  readonly language: FeedLanguage | null;
  readonly authors: AttributionCandidatesValue;
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

/**
 * Fingerprint of the feed-provided fields of an item, used to detect when a
 * feed re-serves an already-known item (same `ItemKey`) with different
 * content. Computed from the feed's own fields only — never from extracted
 * full-content HTML, which can vary poll to poll independent of the feed.
 */
export function contentFingerprint(item: FeedItem): string {
  return sha256Hex(JSON.stringify([
    item.title,
    item.contentHtml,
    item.summaryHtml,
    item.link,
    item.publishedAt?.toISOString() ?? null,
    item.language,
    AttributionCandidates.values(item.authors),
  ]));
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
      authors: AttributionCandidates.fromRaw(raw.authorUris),
    });
  },
} as const;
