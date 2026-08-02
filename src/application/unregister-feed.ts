import { Handle, type InvalidHandle } from "../domain/feed/handle.js";
import type { Feed } from "../domain/feed/feed.js";
import type { FeedRepository } from "../domain/ports/feed-repository.js";
import type { FederationGateway } from "../domain/ports/federation-gateway.js";
import type { ItemRepository } from "../domain/ports/item-repository.js";
import { err, ok, type Result } from "../shared/result.js";

export type UnregisterFeedError =
  | InvalidHandle
  | { readonly type: "UnknownFeed"; readonly handle: Handle };

export type UnregisterFeedResult = {
  readonly feed: Feed;
  /** Whether the Delete activity reached the federation layer successfully. */
  readonly deletionPropagated: boolean;
};

/**
 * Operator-facing removal (deliberately NOT exposed as a bot command —
 * PLAN.md 확정 사항). Propagates the actor Delete first, then removes local
 * state; local removal proceeds even when propagation fails, so a dead feed
 * can always be cleaned up.
 */
export type UnregisterFeed = {
  execute(
    rawHandle: string,
  ): Promise<Result<UnregisterFeedResult, UnregisterFeedError>>;
};

export function createUnregisterFeed(deps: {
  readonly feeds: FeedRepository;
  readonly items: ItemRepository;
  readonly federation: FederationGateway;
}): UnregisterFeed {
  return {
    async execute(rawHandle) {
      const handleResult = Handle.create(rawHandle);
      if (!handleResult.ok) return handleResult;

      const feed = await deps.feeds.findByHandle(handleResult.value);
      if (feed === null) {
        return err({ type: "UnknownFeed", handle: handleResult.value });
      }

      const deletion = await deps.federation.deleteActor(feed);
      await deps.items.removeAllOf(feed.id);
      await deps.feeds.remove(feed.id);

      return ok({ feed, deletionPropagated: deletion.ok });
    },
  };
}
