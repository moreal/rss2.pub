import type { Context, Federation } from "@fedify/fedify";
import {
  Accept,
  type Actor,
  Follow,
  Undo,
} from "@fedify/vocab";
import { getLogger } from "@logtape/logtape";
import type { FollowerTracker } from "../../application/follower-tracker.js";
import { Handle } from "../../domain/feed/handle.js";
import type { FeedRepository } from "../../domain/ports/feed-repository.js";
import { isErr } from "../../shared/result.js";
import { MAIN_ACTOR_HANDLE } from "./identity.js";
import type { FederationRepository } from "./model.js";

const logger = getLogger(["rss2pub", "federation", "inbox"]);

type ResolveFollowActor = (
  ctx: Context<void>,
  follow: Follow,
) => Promise<Actor | null>;

type SendAccept = (
  senderHandle: string,
  recipient: Actor,
  activity: Accept,
) => Promise<void>;

type InboxHandlerDependencies = {
  readonly feeds: FeedRepository;
  readonly repository: FederationRepository;
  readonly followerTracker: FollowerTracker;
  readonly resolveFollowActor?: ResolveFollowActor;
  readonly sendAccept?: SendAccept;
};

async function defaultResolveFollowActor(
  ctx: Context<void>,
  follow: Follow,
): Promise<Actor | null> {
  return follow.getActor({
    contextLoader: ctx.contextLoader,
    documentLoader: ctx.documentLoader,
    suppressError: true,
  });
}

async function localActorExists(
  identifier: string,
  feeds: FeedRepository,
): Promise<boolean> {
  if (identifier === MAIN_ACTOR_HANDLE) return true;
  const handle = Handle.create(identifier);
  return !isErr(handle) && await feeds.findByHandle(handle.value) !== null;
}

async function targetIdentifier(
  ctx: Context<void>,
  recipient: string | null,
  objectId: URL | null,
  feeds: FeedRepository,
): Promise<string | null> {
  const parsed = ctx.parseUri(objectId);
  if (parsed?.type !== "actor") return null;
  if (recipient !== null && recipient !== parsed.identifier) return null;
  return await localActorExists(parsed.identifier, feeds)
    ? parsed.identifier
    : null;
}

export function createInboxHandlers(deps: InboxHandlerDependencies) {
  const resolveFollowActor = deps.resolveFollowActor ?? defaultResolveFollowActor;

  return {
    async follow(
      ctx: Context<void>,
      recipient: string | null,
      follow: Follow,
    ): Promise<void> {
      const identifier = await targetIdentifier(
        ctx,
        recipient,
        follow.objectId,
        deps.feeds,
      );
      if (identifier === null) return;
      const actor = await resolveFollowActor(ctx, follow);
      if (actor === null || actor.id === null || actor.inboxId === null) return;

      const inserted = await deps.repository.addFollower({
        localHandle: identifier,
        actorUri: actor.id.href,
        inboxUri: actor.inboxId.href,
        sharedInboxUri: actor.endpoints?.sharedInbox?.href ?? null,
        followedAt: new Date(),
      });
      if (inserted && identifier !== MAIN_ACTOR_HANDLE) {
        const tracked = await deps.followerTracker.recordFollow(identifier);
        if (isErr(tracked)) {
          logger.warn("failed to track Follow for {identifier}: {error}", {
            identifier,
            error: tracked.error,
          });
        }
      }

      const accept = new Accept({
        ...(follow.id === null ? {} : { id: new URL("#accept", follow.id) }),
        actor: ctx.getActorUri(identifier),
        object: follow,
      });
      if (deps.sendAccept !== undefined) {
        await deps.sendAccept(identifier, actor, accept);
      } else {
        await ctx.sendActivity({ identifier }, actor, accept);
      }
    },

    async undo(
      ctx: Context<void>,
      recipient: string | null,
      undo: Undo,
    ): Promise<void> {
      if (undo.actorId === null) return;
      const nested = await undo.getObject(ctx);
      if (!(nested instanceof Follow)
        || nested.actorId === null
        || nested.actorId.href !== undo.actorId.href) return;
      const identifier = await targetIdentifier(
        ctx,
        recipient,
        nested.objectId,
        deps.feeds,
      );
      if (identifier === null) return;

      const removed = await deps.repository.removeFollower(
        identifier,
        undo.actorId.href,
      );
      if (removed && identifier !== MAIN_ACTOR_HANDLE) {
        const tracked = await deps.followerTracker.recordUnfollow(identifier);
        if (isErr(tracked)) {
          logger.warn("failed to track Undo(Follow) for {identifier}: {error}", {
            identifier,
            error: tracked.error,
          });
        }
      }
    },
  };
}

export function registerInboxListeners(
  federation: Federation<void>,
  deps: InboxHandlerDependencies,
): void {
  const handlers = createInboxHandlers(deps);
  federation
    .setInboxListeners("/ap/actor/{identifier}/inbox", "/ap/inbox")
    .on(Follow, (ctx, follow) => handlers.follow(ctx, ctx.recipient, follow))
    .on(Undo, (ctx, undo) => handlers.undo(ctx, ctx.recipient, undo))
    .setSharedKeyDispatcher(() => ({ identifier: MAIN_ACTOR_HANDLE }))
    .withIdempotency("per-inbox");
}
