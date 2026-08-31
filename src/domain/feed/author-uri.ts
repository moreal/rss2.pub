import type { Brand } from "../../shared/brand.js";

/** Canonical absolute HTTP(S) URI declared for an effective Atom author. */
export type AuthorUri = Brand<string, "AuthorUri">;

/** Ordered, canonical, deduplicated, and bounded author attribution inputs. */
export type AttributionCandidates = Brand<
  readonly AuthorUri[],
  "AttributionCandidates"
>;

export const MAX_AUTHOR_CANDIDATES = 8;

function parseAuthorUri(raw: string): AuthorUri | null {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  return parsed.href as AuthorUri;
}

export const AttributionCandidates = {
  fromRaw(raw: readonly string[]): AttributionCandidates {
    const seen = new Set<string>();
    const values: AuthorUri[] = [];
    for (const candidate of raw) {
      const parsed = parseAuthorUri(candidate);
      if (parsed === null || seen.has(parsed)) continue;
      seen.add(parsed);
      values.push(parsed);
      if (values.length === MAX_AUTHOR_CANDIDATES) break;
    }
    return Object.freeze(values) as AttributionCandidates;
  },

  values(candidates: AttributionCandidates): readonly AuthorUri[] {
    return candidates;
  },
} as const;
