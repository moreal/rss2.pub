import type { Brand } from "../../shared/brand.js";
import type { Result } from "../../shared/result.js";
import type { PostContent } from "../content/content-policy.js";
import type { Feed, FeedId } from "../feed/feed.js";

export type FederationError = {
  readonly type: "FederationDeliveryFailed";
  readonly feedId: FeedId;
  readonly message: string;
};

/** The federated object's own URI, as handed back by `publish()`. */
export type MessageUri = Brand<string, "MessageUri">;

export type PublishedMessage = {
  readonly messageUri: MessageUri;
};

/**
 * Outbound federation port: everything the application layer may ask the
 * ActivityPub stack to do. The adapter (BotKit) stays behind this boundary.
 */
export type FederationGateway = {
  /** Publishes one post as the feed's actor, fanning out to followers. */
  publish(
    feed: Feed,
    content: PostContent,
  ): Promise<Result<PublishedMessage, FederationError>>;
  /** Edits a previously published post in place, sending an `Update` activity. */
  update(
    feed: Feed,
    messageUri: MessageUri,
    content: PostContent,
  ): Promise<Result<void, FederationError>>;
  /** Propagates actor deletion to followers when a feed is removed. */
  deleteActor(feed: Feed): Promise<Result<void, FederationError>>;
};
