import type { Feed } from "./feed.js";

/** Source retrieval health; it does not promise successful delivery to followers. */
export type CollectionState = "pending" | "healthy" | "failed";

export function collectionState(feed: Feed): CollectionState {
  if (feed.consecutiveFailures > 0) return "failed";
  return feed.lastSuccessfulPollAt === null ? "pending" : "healthy";
}
