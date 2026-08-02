/**
 * Minimal HTML text utilities for content-size decisions and teasers.
 * Deliberately regex-based: the domain needs "roughly how much text" and
 * "the first paragraph", not a spec-compliant DOM — rendering fidelity is an
 * adapter concern.
 */

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(text: string): string {
  return text.replace(
    /&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g,
    (whole, body: string) => {
      if (body.startsWith("#")) {
        const isHex = body[1] === "x" || body[1] === "X";
        const code = Number.parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
        if (!Number.isInteger(code) || code < 0 || code > 0x10_ffff) {
          return whole;
        }
        return String.fromCodePoint(code);
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
    },
  );
}

export function stripHtml(html: string): string {
  const withoutBlocks = html
    .replace(/<script[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style[\s\S]*?<\/style\s*>/gi, " ");
  const withoutTags = withoutBlocks.replace(/<[^>]+>/g, " ");
  return decodeEntities(withoutTags).replace(/\s+/g, " ").trim();
}

/**
 * Inner HTML of the first `<p>` block; for tag-less content, the first
 * blank-line-separated block. Returns null when there is no block smaller
 * than the whole content (caller then falls back to plain-text truncation).
 */
export function firstParagraph(html: string): string | null {
  const paragraph = /<p(?:\s[^>]*)?>([\s\S]*?)<\/p\s*>/i.exec(html)?.[1]?.trim();
  if (paragraph !== undefined && paragraph.length > 0) return paragraph;

  const block = html.split(/\n\s*\n/, 1)[0]?.trim() ?? "";
  if (block.length > 0 && block.length < html.trim().length) return block;
  return null;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Truncates to at most `maxChars` chars, ellipsis included when cut. */
export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}
