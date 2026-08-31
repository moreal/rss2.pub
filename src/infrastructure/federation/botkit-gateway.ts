import { Article, type AuthorizedMessage, type MessageClass } from "@fedify/botkit";
import type { BotGroup } from "@fedify/botkit";
import { Delete, Tombstone } from "@fedify/vocab";
import { getLogger } from "@logtape/logtape";
import type { PostContent } from "../../domain/content/content-policy.js";
import type { Feed } from "../../domain/feed/feed.js";
import type { ItemKey } from "../../domain/feed/feed-item.js";
import type {
  FederationError,
  FederationGateway,
  MessageUri,
  PublishedMessage,
} from "../../domain/ports/federation-gateway.js";
import { err, ok, type Result } from "../../shared/result.js";
import { RawHtmlText, RawInlineHtmlText } from "./raw-html-text.js";
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
 * FederationGateway over a BotKit dynamic bot group. Since BotKit 0.6,
 * `session.publish()` takes object-level `name`/`summary`/`url` directly
 * (and language-tags all three alongside `content`), so both kinds go out
 * in a single Create — no post-publish repository rewrite. `url` (the
 * original feed item link, distinct from the object's own `id`) makes
 * Mastodon treat it as the post's permalink and, for Articles, appends it
 * to the rendered text; Articles additionally need `name`/`summary` for
 * Mastodon's title+teaser+link view.
 */
export function createBotKitFederationGateway(deps: {
  readonly group: BotGroup<void>;
  readonly origin: string;
}): FederationGateway {
  // `linkUrl` comes straight from the feed (FeedItem.link is unvalidated —
  // see feed-item.ts) and may be relative or otherwise malformed. Fail soft:
  // a bad link should only fall back to the message's BotKit page URL, not
  // abort the whole publish.
  function parseLinkUrl(linkUrl: string | null): URL | null {
    if (linkUrl === null) return null;
    try {
      return new URL(linkUrl);
    } catch {
      logger.warn("skipping url metadata: not an absolute URL {link}", {
        link: linkUrl,
      });
      return null;
    }
  }

  return {
    async publish(
      feed: Feed,
      _itemKey: ItemKey,
      content: PostContent,
    ): Promise<Result<PublishedMessage, FederationError>> {
      try {
        const session = await deps.group.getSession(
          deps.origin,
          feed.handle,
          undefined,
        );
        const url = parseLinkUrl(content.linkUrl);
        const message =
          content.kind === "note"
            ? await session.publish(new RawHtmlText(renderNoteHtml(content)), {
                visibility: "public",
                ...(content.language !== null
                  ? { language: content.language }
                  : {}),
                ...(url !== null ? { url } : {}),
              })
            : await session.publish(new RawHtmlText(renderArticleHtml(content)), {
                class: Article,
                visibility: "public",
                name: content.name,
                summary: new RawInlineHtmlText(renderArticleSummaryHtml(content)),
                ...(content.language !== null
                  ? { language: content.language }
                  : {}),
                ...(url !== null ? { url } : {}),
              });
        return ok({ messageUri: message.id.href as MessageUri });
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

    async update(
      feed: Feed,
      messageUri: MessageUri,
      content: PostContent,
    ): Promise<Result<void, FederationError>> {
      try {
        const session = await deps.group.getSession(
          deps.origin,
          feed.handle,
          undefined,
        );
        let target: AuthorizedMessage<MessageClass, void> | undefined;
        for await (const message of session.getOutbox({ order: "newest" })) {
          if (message.id.href === messageUri) {
            target = message;
            break;
          }
        }
        if (target === undefined) {
          return err({
            type: "FederationDeliveryFailed",
            feedId: feed.id,
            message: `message not found in outbox: ${messageUri}`,
          });
        }
        const url = parseLinkUrl(content.linkUrl);
        if (content.kind === "note") {
          await target.update(new RawHtmlText(renderNoteHtml(content)), {
            ...(url !== null ? { url } : {}),
          });
        } else {
          await target.update(new RawHtmlText(renderArticleHtml(content)), {
            name: content.name,
            summary: new RawInlineHtmlText(renderArticleSummaryHtml(content)),
            ...(url !== null ? { url } : {}),
          });
        }
        return ok(undefined);
      } catch (cause) {
        logger.error("update failed for {handle}: {error}", {
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
