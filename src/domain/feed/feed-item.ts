import type { Brand } from "../../shared/brand.js";
import { err, ok, type Result } from "../../shared/result.js";
import { sha256Hex } from "../../shared/sha256.js";

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
};

export type FeedItem = {
  readonly key: ItemKey;
  readonly title: string | null;
  readonly link: string | null;
  readonly contentHtml: string;
  readonly summaryHtml: string | null;
  readonly publishedAt: Date | null;
};

export type UnidentifiableItem = { readonly type: "UnidentifiableItem" };

function normalize(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length === 0 ? null : trimmed;
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
    });
  },
} as const;
