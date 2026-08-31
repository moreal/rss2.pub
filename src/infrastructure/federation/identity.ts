import type { FeedId } from "../../domain/feed/feed.js";
import type { ItemKey } from "../../domain/feed/feed-item.js";
import { sha256Hex } from "../../shared/sha256.js";

export function stableObjectId(feedId: FeedId, itemKey: ItemKey): string {
  return sha256Hex(`${feedId}\u0000${itemKey}`);
}
