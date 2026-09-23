import type { I18n } from "@lingui/core";
import {
  SanitizedHtml,
  renderActorProfile,
  renderMessageDetail,
  renderRemoteFollowError,
  type ActorProfileModel,
  type MessageDetailModel,
  type RemoteFollowErrorModel,
} from "@rss2pub/web-ui/server";
import { Hono } from "hono";
import { raw } from "hono/html";
import { escapeHtml, stripHtml, truncateText } from "../domain/content/html.js";
import { Feed } from "../domain/feed/feed.js";
import { Handle } from "../domain/feed/handle.js";
import type { FeedRepository } from "../domain/ports/feed-repository.js";
import {
  RemoteFollowAccount,
  type RemoteFollowResolver,
} from "../domain/ports/remote-follow-resolver.js";
import { MAIN_ACTOR_HANDLE } from "../infrastructure/federation/identity.js";
import type {
  FederationRepository,
  StoredFederationObject,
} from "../infrastructure/federation/model.js";
import {
  renderFeedProfileHtml,
  sanitizeFeedHtml,
} from "../infrastructure/federation/render.js";
import { isErr } from "../shared/result.js";
import { translate } from "./i18n.js";
import { negotiateLocale } from "./locale-middleware.js";
import { pageContext, type PageContext } from "./page-context.js";
import { Layout } from "./ui/layout.js";
import { copy } from "./ui/messages.js";

function acceptsHtml(accept: string | undefined): boolean {
  return (
    accept === undefined ||
    accept.includes("text/html") ||
    accept.includes("*/*")
  );
}

function absoluteUrl(rawUrl: string | null): URL | null {
  if (rawUrl === null) return null;
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

/** Best-effort Mastodon fallback when WebFinger has no subscribe endpoint. */
function guessAuthorizeInteractionUrl(
  domain: string,
  localActorAcct: string,
): URL | null {
  try {
    const target = new URL(`https://${domain}/authorize_interaction`);
    target.searchParams.set("uri", `acct:${localActorAcct}`);
    return target;
  } catch {
    return null;
  }
}

function formatDate(locale: string, date: Date): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

const POST_PREVIEW_MAX_CHARS = 200;

function remoteFollowErrorPage(
  actorHandle: string,
  actorName: string,
  ctx: PageContext,
) {
  const title = translate(ctx.i18n, copy.federationRemoteFollowTitle);
  const model: RemoteFollowErrorModel = {
    actorHandle,
    title,
    invalidAccount: translate(ctx.i18n, copy.federationRemoteFollowInvalidAccount),
    backLabel: translate(ctx.i18n, copy.federationBackToActor, { name: actorName }),
  };
  return <Layout ctx={ctx} title={title}>{raw(renderRemoteFollowError(model))}</Layout>;
}

/** List-view preview from a sanitized summary or a plain-text Note teaser. */
function listPreviewHtml(object: StoredFederationObject): SanitizedHtml {
  if (object.summaryHtml !== null) {
    return SanitizedHtml.fromSanitized(sanitizeFeedHtml(object.summaryHtml));
  }
  const content = stripEmbeddedChrome(
    sanitizeFeedHtml(object.contentHtml),
    object,
  );
  const snippet = truncateText(
    stripHtml(content),
    POST_PREVIEW_MAX_CHARS,
  );
  return SanitizedHtml.fromSanitized(snippet.length === 0 ? "" : `<p>${escapeHtml(snippet)}</p>`);
}

/** Remove the title and source link embedded by the federation renderer. */
function stripEmbeddedChrome(
  sanitizedHtml: string,
  object: StoredFederationObject,
): string {
  if (object.name === null) return sanitizedHtml;

  const leading = /^\s*<p><strong>([^<]*)<\/strong><\/p>\s*/.exec(
    sanitizedHtml,
  );
  if (leading === null || leading[1] !== escapeHtml(object.name)) {
    return sanitizedHtml;
  }

  const withoutTitle = sanitizedHtml.slice(leading[0].length);
  if (object.sourceUrl === null) return withoutTitle;

  const trailingSource =
    /\s*<p><a href="([^"]+)"(?: [^>]*)?>[^<]*<\/a><\/p>\s*$/.exec(
      withoutTitle,
    );
  if (
    trailingSource === null ||
    trailingSource[1] !== escapeHtml(object.sourceUrl)
  ) {
    return withoutTitle;
  }
  return withoutTitle.slice(0, -trailingSource[0].length);
}

function fallbackTitle(object: StoredFederationObject, i18n: I18n): string {
  if (object.name !== null) return object.name;
  return translate(i18n, copy.federationPostFallback);
}

function messageDetailModel(
  handle: string,
  actorName: string,
  iconUrl: string | null,
  object: StoredFederationObject,
  ctx: PageContext,
): MessageDetailModel {
  return {
    handle,
    host: ctx.host,
    actorName,
    iconUrl,
    title: fallbackTitle(object, ctx.i18n),
    summaryHtml: object.summaryHtml === null ? null : SanitizedHtml.fromSanitized(sanitizeFeedHtml(object.summaryHtml)),
    contentHtml: SanitizedHtml.fromSanitized(stripEmbeddedChrome(sanitizeFeedHtml(object.contentHtml), object)),
    publishedIso: object.publishedAt.toISOString(),
    publishedLabel: formatDate(ctx.i18n.locale, object.publishedAt),
    sourceHref: absoluteUrl(object.sourceUrl)?.href ?? null,
    viewOriginalLabel: translate(ctx.i18n, copy.federationViewOriginal),
  };
}

export function createFederationPages(deps: {
  readonly origin: string;
  readonly feeds: FeedRepository;
  readonly federationObjects: FederationRepository;
  readonly remoteFollow: RemoteFollowResolver;
}): Hono {
  const app = new Hono();
  const host = new URL(deps.origin).host;

  app.get("/:actor", negotiateLocale, async (c) => {
    if (!acceptsHtml(c.req.header("accept"))) return c.body(null, 406);
    const actor = c.req.param("actor");
    if (!actor.startsWith("@")) return c.notFound();
    const rawHandle = actor.slice(1);
    const ctx = pageContext(c, { origin: deps.origin, host });
    let name: string;
    let summary: SanitizedHtml;
    let icon: string | null;
    if (rawHandle === MAIN_ACTOR_HANDLE) {
      name = "rss2.pub";
      summary = SanitizedHtml.fromSanitized(`<p>${escapeHtml(translate(ctx.i18n, copy.federationMainActorSummary))}</p>`);
      icon = null;
    } else {
      const handle = Handle.create(rawHandle);
      if (isErr(handle)) return c.notFound();
      const feed = await deps.feeds.findByHandle(handle.value);
      if (feed === null) return c.notFound();
      name = Feed.displayName(feed);
      summary = SanitizedHtml.fromSanitized(sanitizeFeedHtml(renderFeedProfileHtml(feed)));
      icon = feed.iconUrl;
    }

    const followers = await deps.federationObjects.countFollowers(rawHandle);
    const posts = await deps.federationObjects.listObjects(rawHandle, null, 20);
    const model: ActorProfileModel = {
      handle: rawHandle,
      host,
      name,
      iconUrl: icon,
      summaryHtml: summary,
      followersLabel: translate(ctx.i18n, copy.feedFollowers, { count: followers }),
      locale: ctx.locale,
      followHeading: translate(ctx.i18n, copy.federationRemoteFollowLabel),
      followPlaceholder: translate(ctx.i18n, copy.federationRemoteFollowPlaceholder),
      followButton: translate(ctx.i18n, copy.federationRemoteFollowButton),
      noPostsTitle: translate(ctx.i18n, copy.federationNoPostsTitle),
      noPostsBody: translate(ctx.i18n, copy.federationNoPostsBody),
      posts: posts.items.map((object) => ({
        id: object.id,
        title: fallbackTitle(object, ctx.i18n),
        previewHtml: listPreviewHtml(object),
        publishedIso: object.publishedAt.toISOString(),
        publishedLabel: formatDate(ctx.i18n.locale, object.publishedAt),
      })),
    };
    return c.html(
      <Layout
        ctx={ctx}
        title={rawHandle === MAIN_ACTOR_HANDLE ? undefined : name}
      >
        {raw(renderActorProfile(model))}
      </Layout>,
    );
  });

  app.get("/:actor/remote-follow", negotiateLocale, async (c) => {
    const actor = c.req.param("actor");
    if (!actor.startsWith("@")) return c.notFound();
    const rawHandle = actor.slice(1);
    const ctx = pageContext(c, { origin: deps.origin, host });
    let actorName = "rss2.pub";
    if (rawHandle !== MAIN_ACTOR_HANDLE) {
      const handle = Handle.create(rawHandle);
      if (isErr(handle)) return c.notFound();
      const feed = await deps.feeds.findByHandle(handle.value);
      if (feed === null) return c.notFound();
      actorName = Feed.displayName(feed);
    }
    const account = RemoteFollowAccount.create(c.req.query("acct") ?? "");
    if (isErr(account)) {
      return c.html(
        remoteFollowErrorPage(rawHandle, actorName, ctx),
        400,
      );
    }
    const localActorAcct = `${rawHandle}@${host}`;
    const resolved = await deps.remoteFollow.resolveSubscribeUrl(
      account.value,
      localActorAcct,
    );
    const target = resolved.ok
      ? resolved.value
      : guessAuthorizeInteractionUrl(
          RemoteFollowAccount.domain(account.value),
          localActorAcct,
        );
    if (target === null) {
      return c.html(
        remoteFollowErrorPage(rawHandle, actorName, ctx),
        400,
      );
    }
    return c.redirect(target.toString(), 302);
  });

  app.get("/:actor/:id", negotiateLocale, async (c) => {
    if (!acceptsHtml(c.req.header("accept"))) return c.body(null, 406);
    const actor = c.req.param("actor");
    if (!actor.startsWith("@")) return c.notFound();
    const handle = actor.slice(1);
    const id = c.req.param("id");
    if (id === "followers") return c.notFound();
    let actorName = "rss2.pub";
    let iconUrl: string | null = null;
    if (handle !== MAIN_ACTOR_HANDLE) {
      const parsed = Handle.create(handle);
      if (isErr(parsed)) return c.notFound();
      const feed = await deps.feeds.findByHandle(parsed.value);
      if (feed === null) return c.notFound();
      actorName = Feed.displayName(feed);
      iconUrl = feed.iconUrl;
    }
    const object = await deps.federationObjects.findObject(handle, id);
    if (object === null) return c.notFound();
    const ctx = pageContext(c, { origin: deps.origin, host });
    const model = messageDetailModel(handle, actorName, iconUrl, object, ctx);
    return c.html(
      <Layout ctx={ctx} title={model.title}>{raw(renderMessageDetail(model))}</Layout>,
    );
  });

  return app;
}
