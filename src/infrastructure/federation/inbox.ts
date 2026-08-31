import type { Context, Federation } from "@fedify/fedify";
import {
  Accept,
  Article,
  type Actor,
  Create,
  Follow,
  Mention,
  Note,
  PUBLIC_COLLECTION,
  Undo,
} from "@fedify/vocab";
import { getLogger } from "@logtape/logtape";
import type { FollowerTracker } from "../../application/follower-tracker.js";
import type { CommandHandler, ReplyPart } from "../../application/handle-command.js";
import { escapeHtml, stripHtml } from "../../domain/content/html.js";
import { Handle } from "../../domain/feed/handle.js";
import type { Clock } from "../../domain/ports/clock.js";
import type { FeedRepository } from "../../domain/ports/feed-repository.js";
import { isErr } from "../../shared/result.js";
import { sha256Hex } from "../../shared/sha256.js";
import { buildCreate } from "./vocab-builders.js";
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

type ResolveCreateActor = (
  ctx: Context<void>,
  create: Create,
) => Promise<Actor | null>;

type SendReply = (
  senderHandle: string,
  recipient: Actor,
  activity: Create,
) => Promise<void>;

type InboxHandlerDependencies = {
  readonly feeds: FeedRepository;
  readonly repository: FederationRepository;
  readonly followerTracker: FollowerTracker;
  readonly commandHandler?: CommandHandler;
  readonly host?: string;
  readonly clock?: Clock;
  readonly resolveFollowActor?: ResolveFollowActor;
  readonly sendAccept?: SendAccept;
  readonly resolveCreateActor?: ResolveCreateActor;
  readonly sendReply?: SendReply;
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

async function defaultResolveCreateActor(
  ctx: Context<void>,
  create: Create,
): Promise<Actor | null> {
  return create.getActor({
    contextLoader: ctx.contextLoader,
    documentLoader: ctx.documentLoader,
    suppressError: true,
  });
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function renderReply(
  ctx: Context<void>,
  parts: readonly ReplyPart[],
  host: string,
  feeds: FeedRepository,
): Promise<{ readonly html: string; readonly mentions: readonly {
  readonly name: string;
  readonly href: string;
}[] }> {
  const mentionPattern = new RegExp(`^@([a-z0-9_]+)@${escapePattern(host)}$`);
  const html: string[] = [];
  const mentions: { name: string; href: string }[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      html.push(escapeHtml(part.value).replace(/\n/g, "<br>"));
      continue;
    }
    const match = mentionPattern.exec(part.handle);
    const handle = match?.[1] === undefined ? null : Handle.create(match[1]);
    const feed = handle === null || isErr(handle)
      ? null
      : await feeds.findByHandle(handle.value);
    if (feed === null) {
      html.push(escapeHtml(part.handle));
      continue;
    }
    const href = ctx.getActorUri(feed.handle).href;
    html.push(escapeHtml(part.handle));
    mentions.push({ name: part.handle, href });
  }
  return { html: `<p>${html.join("")}</p>`, mentions };
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
  const resolveCreateActor = deps.resolveCreateActor ?? defaultResolveCreateActor;

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

    async create(
      ctx: Context<void>,
      recipient: string | null,
      create: Create,
    ): Promise<void> {
      if (recipient !== MAIN_ACTOR_HANDLE
        || deps.commandHandler === undefined
        || deps.host === undefined
        || deps.clock === undefined
        || create.id === null
        || create.actorId === null) return;
      const object = await create.getObject(ctx);
      if (!(object instanceof Note) && !(object instanceof Article)) return;

      const mainActor = ctx.getActorUri(MAIN_ACTOR_HANDLE);
      const audience = [...object.toIds, ...object.ccIds];
      const direct = audience.some((uri) => uri.href === mainActor.href)
        && !audience.some((uri) => uri.href === PUBLIC_COLLECTION.href);
      let mentioned = false;
      for await (const tag of object.getTags()) {
        if (tag instanceof Mention && tag.href?.href === mainActor.href) {
          mentioned = true;
          break;
        }
      }
      if (!direct && !mentioned) return;

      const sender = await resolveCreateActor(ctx, create);
      if (sender === null || sender.id === null || sender.inboxId === null) return;
      const id = sha256Hex(`reply\u0000${create.id.href}`);
      if (await deps.repository.findObject(MAIN_ACTOR_HANDLE, id) !== null) return;

      const command = stripHtml(String(object.content ?? ""));
      const parts = await deps.commandHandler.handle(command);
      const rendered = await renderReply(ctx, parts, deps.host, deps.feeds);
      const record = {
        id,
        actorHandle: MAIN_ACTOR_HANDLE,
        kind: "note" as const,
        contentHtml: rendered.html,
        name: null,
        summaryHtml: null,
        sourceUrl: null,
        language: null,
        toUris: direct ? [sender.id.href] : [PUBLIC_COLLECTION.href],
        ccUris: direct ? [] : [sender.id.href],
        attributedToUris: [mainActor.href],
        mentions: rendered.mentions,
        publishedAt: deps.clock.now(),
        updatedAt: null,
      };
      await deps.repository.upsertObject(record);
      const activity = buildCreate(ctx, record);
      if (deps.sendReply !== undefined) {
        await deps.sendReply(MAIN_ACTOR_HANDLE, sender, activity);
      } else {
        await ctx.sendActivity({ identifier: MAIN_ACTOR_HANDLE }, sender, activity);
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
    .on(Create, (ctx, create) => handlers.create(ctx, ctx.recipient, create))
    .setSharedKeyDispatcher(() => ({ identifier: MAIN_ACTOR_HANDLE }))
    .withIdempotency("per-inbox");
}
