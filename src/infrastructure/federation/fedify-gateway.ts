import type { Context, Federation } from "@fedify/fedify";
import {
  type Activity,
  Article,
  Delete,
  Note,
  PUBLIC_COLLECTION,
  Tombstone,
} from "@fedify/vocab";
import { getLogger } from "@logtape/logtape";
import type { PostContent } from "../../domain/content/content-policy.js";
import type { Feed } from "../../domain/feed/feed.js";
import type { ItemKey } from "../../domain/feed/feed-item.js";
import type { Clock } from "../../domain/ports/clock.js";
import {
  type FederationError,
  type FederationGateway,
  MessageUri,
  type PublishedMessage,
} from "../../domain/ports/federation-gateway.js";
import { err, ok, type Result } from "../../shared/result.js";
import { stableObjectId } from "./identity.js";
import type {
  FederationRepository,
  StoredFederationObject,
} from "./model.js";
import {
  renderArticleHtml,
  renderArticleSummaryHtml,
  renderNoteHtml,
} from "./render.js";
import { buildCreate, buildMessage, buildUpdate } from "./vocab-builders.js";

const logger = getLogger(["rss2pub", "federation"]);

type SendActivity = (
  senderHandle: string,
  recipients: "followers",
  activity: Activity,
) => Promise<void>;

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function initialObject(
  ctx: Context<void>,
  feed: Feed,
  itemKey: ItemKey,
  content: PostContent,
  now: Date,
): StoredFederationObject {
  const id = stableObjectId(feed.id, itemKey);
  return {
    id,
    actorHandle: feed.handle,
    kind: content.kind,
    contentHtml: content.kind === "note"
      ? renderNoteHtml(content)
      : renderArticleHtml(content),
    name: content.kind === "article" ? content.name : null,
    summaryHtml: content.kind === "article"
      ? renderArticleSummaryHtml(content)
      : null,
    sourceUrl: content.linkUrl,
    language: content.language,
    toUris: [PUBLIC_COLLECTION.href],
    ccUris: [ctx.getFollowersUri(feed.handle).href],
    attributedToUris: [ctx.getActorUri(feed.handle).href],
    mentions: [],
    publishedAt: now,
    updatedAt: null,
  };
}

function updatedObject(
  existing: StoredFederationObject,
  content: PostContent,
  now: Date,
): StoredFederationObject {
  const contentHtml = content.kind === "note"
    ? renderNoteHtml(content)
    : renderArticleHtml(content);
  if (existing.kind === "note") {
    return {
      ...existing,
      contentHtml,
      name: null,
      summaryHtml: null,
      sourceUrl: content.linkUrl,
      language: content.language,
      updatedAt: now,
    };
  }
  return {
    ...existing,
    contentHtml,
    name: content.kind === "article" ? content.name : content.title,
    summaryHtml: content.kind === "article"
      ? renderArticleSummaryHtml(content)
      : null,
    sourceUrl: content.linkUrl,
    language: content.language,
    updatedAt: now,
  };
}

export function createFedifyGateway(deps: {
  readonly federation: Federation<void>;
  readonly repository: FederationRepository;
  readonly origin: string;
  readonly clock: Clock;
  readonly sendActivity?: SendActivity;
}): FederationGateway {
  const ctx = deps.federation.createContext(new URL(deps.origin), undefined);

  async function send(
    senderHandle: string,
    activity: Activity,
  ): Promise<void> {
    if (deps.sendActivity !== undefined) {
      await deps.sendActivity(senderHandle, "followers", activity);
      return;
    }
    await ctx.sendActivity(
      { identifier: senderHandle },
      "followers",
      activity,
      { preferSharedInbox: true },
    );
  }

  function failure(feed: Feed, cause: unknown): Result<never, FederationError> {
    logger.error("federation delivery failed for {handle}: {error}", {
      handle: feed.handle,
      error: cause,
    });
    return err({
      type: "FederationDeliveryFailed",
      feedId: feed.id,
      message: messageOf(cause),
    });
  }

  return {
    async publish(
      feed: Feed,
      itemKey: ItemKey,
      content: PostContent,
      _additionalAttributions,
    ): Promise<Result<PublishedMessage, FederationError>> {
      try {
        const record = initialObject(ctx, feed, itemKey, content, deps.clock.now());
        await deps.repository.upsertObject(record);
        await send(feed.handle, buildCreate(ctx, record));
        const uri = buildMessage(ctx, record).id;
        if (uri === null) throw new Error("message builder returned no ID");
        return ok({ messageUri: MessageUri.fromUrl(uri) });
      } catch (cause) {
        return failure(feed, cause);
      }
    },

    async update(feed, messageUri, content, _additionalAttributions) {
      try {
        const parsed = ctx.parseUri(new URL(messageUri));
        if (parsed?.type !== "object"
          || (parsed.typeId.href !== Note.typeId.href
            && parsed.typeId.href !== Article.typeId.href)
          || parsed.values.identifier !== feed.handle
          || parsed.values.id === undefined) {
          throw new Error(`message URI is not owned by ${feed.handle}: ${messageUri}`);
        }
        const existing = await deps.repository.findObject(
          feed.handle,
          parsed.values.id,
        );
        if (existing === null) {
          throw new Error(`message not found: ${messageUri}`);
        }
        const record = updatedObject(existing, content, deps.clock.now());
        await deps.repository.upsertObject(record);
        const activityId = new URL(
          `/ap/actor/${encodeURIComponent(feed.handle)}/update/${crypto.randomUUID()}`,
          deps.origin,
        );
        await send(feed.handle, buildUpdate(ctx, record, activityId));
        return ok(undefined);
      } catch (cause) {
        return failure(feed, cause);
      }
    },

    async deleteActor(feed) {
      try {
        const actorId = ctx.getActorUri(feed.handle);
        const activity = new Delete({
          id: new URL("#delete", actorId),
          actor: actorId,
          object: new Tombstone({ id: actorId }),
          tos: [PUBLIC_COLLECTION],
          ccs: [ctx.getFollowersUri(feed.handle)],
        });
        await send(feed.handle, activity);
        await deps.repository.removeObjectsOfActor(feed.handle);
        await deps.repository.removeFollowersOfActor(feed.handle);
        return ok(undefined);
      } catch (cause) {
        return failure(feed, cause);
      }
    },
  };
}
