import { Article, type BotGroup, type Repository } from "@fedify/botkit";
import type { Uuid } from "@fedify/botkit/repository";
import { Delete, Tombstone, Update } from "@fedify/vocab";
import { getLogger } from "@logtape/logtape";
import type { PostContent } from "../../domain/content/content-policy.js";
import type { Feed } from "../../domain/feed/feed.js";
import type {
  FederationError,
  FederationGateway,
} from "../../domain/ports/federation-gateway.js";
import { err, ok, type Result } from "../../shared/result.js";
import { RawHtmlText } from "./raw-html-text.js";
import {
  renderArticleHtml,
  renderArticleSummaryHtml,
  renderNoteHtml,
} from "./render.js";

const logger = getLogger(["rss2pub", "federation"]);

const PUBLIC = new URL("https://www.w3.org/ns/activitystreams#Public");

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * FederationGateway over a BotKit dynamic bot group. Notes publish directly;
 * Articles need a post-publish repository rewrite because BotKit's publish()
 * cannot set the object-level `name`/`summary` — after rewriting we send an
 * Update so remote copies pick up the title (Mastodon renders Articles from
 * name + summary + link only).
 */
export function createBotKitFederationGateway(deps: {
  readonly group: BotGroup<void>;
  readonly repository: Repository;
  readonly origin: string;
}): FederationGateway {
  async function applyArticleMetadata(
    session: Awaited<ReturnType<BotGroup<void>["getSession"]>>,
    identifier: string,
    messageId: URL,
    name: string,
    summaryHtml: string,
  ): Promise<void> {
    // BotKit message URIs end in a UUIDv7 (…/article/{uuid}); validate before
    // branding so a URL-shape change fails loudly instead of silently leaving
    // Articles without name/summary.
    const lastSegment = messageId.pathname.split("/").at(-1) ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(lastSegment)) {
      logger.warn(
        "cannot apply Article metadata: unexpected message URI shape {id}",
        { id: messageId.href },
      );
      return;
    }
    const uuid = lastSegment as Uuid;

    let renamed: Article | null = null;
    await deps.repository.updateMessage(identifier, uuid, async (activity) => {
      const object = await activity.getObject(session.context);
      if (!(object instanceof Article)) return activity;
      renamed = object.clone({ name, summary: summaryHtml });
      return activity.clone({ object: renamed });
    });
    if (renamed === null) return;

    const update = new Update({
      id: new URL(`${messageId.href}#name/${crypto.randomUUID()}`),
      actor: session.actorId,
      tos: [PUBLIC],
      ccs: [session.context.getFollowersUri(identifier)],
      object: renamed,
    });
    await session.context.sendActivity(
      { identifier },
      "followers",
      update,
      { preferSharedInbox: true },
    );
  }

  return {
    async publish(
      feed: Feed,
      content: PostContent,
    ): Promise<Result<void, FederationError>> {
      try {
        const session = await deps.group.getSession(
          deps.origin,
          feed.handle,
          undefined,
        );
        if (content.kind === "note") {
          await session.publish(new RawHtmlText(renderNoteHtml(content)), {
            visibility: "public",
          });
        } else {
          const message = await session.publish(
            new RawHtmlText(renderArticleHtml(content)),
            { class: Article, visibility: "public" },
          );
          await applyArticleMetadata(
            session,
            feed.handle,
            message.id,
            content.name,
            renderArticleSummaryHtml(content),
          );
        }
        return ok(undefined);
      } catch (cause) {
        logger.error("publish failed for {handle}: {error}", {
          handle: feed.handle,
          error: cause,
        });
        return err({
          type: "FederationDeliveryFailed",
          feedId: feed.id,
          message: messageOf(cause),
        });
      }
    },

    async deleteActor(feed: Feed): Promise<Result<void, FederationError>> {
      try {
        // Must run while the feed still resolves in the bot dispatcher —
        // UnregisterFeed calls this before deleting the row.
        const session = await deps.group.getSession(
          deps.origin,
          feed.handle,
          undefined,
        );
        const activity = new Delete({
          id: new URL(`${session.actorId.href}#delete`),
          actor: session.actorId,
          tos: [PUBLIC],
          ccs: [session.context.getFollowersUri(feed.handle)],
          object: new Tombstone({ id: session.actorId }),
        });
        await session.context.sendActivity(
          { identifier: feed.handle },
          "followers",
          activity,
          { preferSharedInbox: true },
        );
        return ok(undefined);
      } catch (cause) {
        logger.error("actor deletion failed for {handle}: {error}", {
          handle: feed.handle,
          error: cause,
        });
        return err({
          type: "FederationDeliveryFailed",
          feedId: feed.id,
          message: messageOf(cause),
        });
      }
    },
  };
}
