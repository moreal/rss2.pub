import type { FeedUrl } from "./feed-url.js";

/** Mastodon account RSS mirrors an existing actor. Tag RSS is a distinct feed. */
export function isMastodonAccountFeed(generator: string | null, url: FeedUrl): boolean {
  if (!generator?.toLowerCase().includes("mastodon")) return false;
  const path = new URL(url).pathname;
  return /^\/@[^/]+\.rss$/i.test(path) || /^\/users\/[^/]+\.rss$/i.test(path);
}
