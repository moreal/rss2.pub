import { Article, Note, type BotGroup, type Repository } from "@fedify/botkit";
import type { Uuid } from "@fedify/botkit/repository";
import { Delete, LanguageString, Tombstone, Update } from "@fedify/vocab";
import { getLogger } from "@logtape/logtape";
import type { PostContent } from "../../domain/content/content-policy.js";
import type { Feed } from "../../domain/feed/feed.js";
import type { FeedLanguage } from "../../domain/feed/feed-language.js";
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
 * FederationGateway over a BotKit dynamic bot group. Both kinds need a
 * post-publish repository rewrite because BotKit's publish() cannot set
 * object-level `name`/`summary`/`url` — after rewriting we send an Update so
 * remote copies pick it up. `url` (the original feed item link, distinct
 * from the object's own `id`) makes Mastodon treat it as the post's
 * permalink and, for Articles, appends it to the rendered text; Articles
 * additionally need `name`/`summary` for Mastodon's title+teaser+link view.
 *
 * This is a workaround for a BotKit API gap, not a permanent design — once
 * BotKit exposes these fields on session.publish() directly, this rewrite
 * step should be removed (see AGENTS.md).
 */
export function createBotKitFederationGateway(deps: {
  readonly group: BotGroup<void>;
  readonly repository: Repository;
  readonly origin: string;
}): FederationGateway {
  type Session = Awaited<ReturnType<BotGroup<void>["getSession"]>>;

  // `linkUrl` comes straight from the feed (FeedItem.link is unvalidated —
  // see feed-item.ts) and may be relative or otherwise malformed. Fail soft:
  // a bad link should only skip the url metadata, not abort the whole
  // publish() (the Note/Article itself has already been sent by then).
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

  // BotKit message URIs end in a UUIDv7 (…/note|article/{uuid}); validate
  // before branding so a URL-shape change fails loudly instead of silently
  // leaving messages with stale object-level metadata.
  function messageUuid(messageId: URL): Uuid | null {
    const lastSegment = messageId.pathname.split("/").at(-1) ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(lastSegment)) {
      return null;
    }
    return lastSegment as Uuid;
  }

  async function sendObjectUpdate(
    session: Session,
    identifier: string,
    messageId: URL,
    object: Article | Note,
  ): Promise<void> {
    const update = new Update({
      id: new URL(`${messageId.href}#update/${crypto.randomUUID()}`),
      actor: session.actorId,
      tos: [PUBLIC],
      ccs: [session.context.getFollowersUri(identifier)],
      object,
    });
    await session.context.sendActivity(
      { identifier },
      "followers",
      update,
      { preferSharedInbox: true },
    );
  }

  async function applyArticleMetadata(
    session: Session,
    identifier: string,
    messageId: URL,
    name: string,
    summaryHtml: string,
    linkUrl: string | null,
    language: FeedLanguage | null,
  ): Promise<void> {
    const uuid = messageUuid(messageId);
    if (uuid === null) {
      logger.warn(
        "cannot apply Article metadata: unexpected message URI shape {id}",
        { id: messageId.href },
      );
      return;
    }

    let renamed: Article | null = null;
    await deps.repository.updateMessage(identifier, uuid, async (activity) => {
      const object = await activity.getObject(session.context);
      if (!(object instanceof Article)) return activity;
      renamed = object.clone({
        // BotKit's own `language` publish option (used below) only tags
        // `content` — name/summary go out through this rewrite regardless,
        // so they need the same LanguageString wrapping applied here.
        name: language === null ? name : new LanguageString(name, language),
        summary:
          language === null ? summaryHtml : new LanguageString(summaryHtml, language),
        url: parseLinkUrl(linkUrl),
      });
      return activity.clone({ object: renamed });
    });
    if (renamed === null) return;
    await sendObjectUpdate(session, identifier, messageId, renamed);
  }

  async function applyNoteUrl(
    session: Session,
    identifier: string,
    messageId: URL,
    linkUrl: string | null,
  ): Promise<void> {
    const url = parseLinkUrl(linkUrl);
    if (url === null) return;
    const uuid = messageUuid(messageId);
    if (uuid === null) {
      logger.warn(
        "cannot apply Note url: unexpected message URI shape {id}",
        { id: messageId.href },
      );
      return;
    }

    let updated: Note | null = null;
    await deps.repository.updateMessage(identifier, uuid, async (activity) => {
      const object = await activity.getObject(session.context);
      if (!(object instanceof Note)) return activity;
      updated = object.clone({ url });
      return activity.clone({ object: updated });
    });
    if (updated === null) return;
    await sendObjectUpdate(session, identifier, messageId, updated);
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
          const message = await session.publish(
            new RawHtmlText(renderNoteHtml(content)),
            {
              visibility: "public",
              ...(content.language !== null ? { language: content.language } : {}),
            },
          );
          await applyNoteUrl(session, feed.handle, message.id, content.linkUrl);
        } else {
          const message = await session.publish(
            new RawHtmlText(renderArticleHtml(content)),
            {
              class: Article,
              visibility: "public",
              ...(content.language !== null ? { language: content.language } : {}),
            },
          );
          await applyArticleMetadata(
            session,
            feed.handle,
            message.id,
            content.name,
            renderArticleSummaryHtml(content),
            content.linkUrl,
            content.language,
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
