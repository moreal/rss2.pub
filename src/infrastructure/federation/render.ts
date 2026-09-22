import sanitizeHtml from "sanitize-html";
import type { PostContent } from "../../domain/content/post-content.js";
import { escapeHtml } from "../../domain/content/html.js";
import type { Feed } from "../../domain/feed/feed.js";

/**
 * Conservative allowlist close to what Mastodon keeps when rendering remote
 * content — anything fancier would be stripped by consumers anyway.
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "a", "span", "del", "s", "pre", "blockquote", "code",
    "b", "strong", "u", "i", "em", "ul", "ol", "li",
    "h1", "h2", "h3", "h4", "h5", "h6",
  ],
  allowedAttributes: { a: ["href"] },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      rel: "nofollow noopener noreferrer",
    }),
  },
};

export function sanitizeFeedHtml(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

function linkParagraph(url: string): string {
  const escaped = escapeHtml(url);
  return `<p><a href="${escaped}" rel="nofollow noopener noreferrer">${escaped}</a></p>`;
}

/** Note body: inlined bold title (WriteFreely style) + content + permalink. */
export function renderNoteHtml(post: PostContent): string {
  const parts: string[] = [];
  if (post.title !== null) {
    parts.push(`<p><strong>${escapeHtml(post.title)}</strong></p>`);
  }
  const body = sanitizeFeedHtml(post.bodyHtml);
  if (body.length > 0) parts.push(body);
  if (post.linkUrl !== null) parts.push(linkParagraph(post.linkUrl));
  return parts.join("\n");
}

/** Actor profile summary for a feed bot. */
export function renderFeedProfileHtml(feed: Feed): string {
  const parts: string[] = [];
  if (feed.description !== null) {
    parts.push(`<p>${escapeHtml(feed.description)}</p>`);
  }
  parts.push(
    `<p>Mirror of <a href="${escapeHtml(feed.url)}" rel="nofollow noopener noreferrer">${escapeHtml(feed.url)}</a>, bridged by rss2.pub.</p>`,
  );
  return parts.join("\n");
}
