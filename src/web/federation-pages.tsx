import type { I18n } from "@lingui/core";
import { Hono } from "hono";
import type { Context, Env } from "hono";
import { raw } from "hono/html";
import type { FC } from "hono/jsx";
import { ContentPolicy } from "../domain/content/content-policy.js";
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
import { i18nFor, translate } from "./i18n.js";
import { negotiateLocale } from "./locale-middleware.js";
import { LOCALE_QUERY_PARAM, resolveLocale } from "./locale.js";
import { Notice } from "./ui/components.js";
import { RssIcon } from "./ui/icons.js";
import { Layout, type PageContext } from "./ui/layout.js";
import { copy } from "./ui/messages.js";

function acceptsHtml(accept: string | undefined): boolean {
  return (
    accept === undefined ||
    accept.includes("text/html") ||
    accept.includes("*/*")
  );
}

function pageContext(
  c: Context<Env>,
  origin: string,
  host: string,
): PageContext {
  const locale = resolveLocale(c.get("language"));
  const url = new URL(c.req.url);
  return {
    origin,
    host,
    locale,
    i18n: i18nFor(locale),
    switcherPath: `${url.pathname}${url.search}`,
  };
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

const ActorAvatar: FC<{
  iconUrl: string | null;
  variant: "profile" | "inline";
}> = (props) => (
  <span
    class={props.variant === "profile" ? "avatar actor-avatar" : "avatar"}
    aria-hidden="true"
  >
    <RssIcon size={props.variant === "profile" ? 32 : 18} />
    {props.iconUrl !== null && (
      <img
        src={props.iconUrl}
        alt=""
        loading="lazy"
        decoding="async"
        onerror="this.remove()"
      />
    )}
  </span>
);

function formatDate(locale: string, date: Date): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

const RemoteFollowForm: FC<{
  handle: string;
  i18n: I18n;
  locale: string;
}> = (props) => {
  const heading = translate(props.i18n, copy.federationRemoteFollowLabel);
  return (
    <section
      class="panel remote-follow"
      aria-labelledby="remote-follow-heading"
    >
      <h2 id="remote-follow-heading">{heading}</h2>
      <form
        method="get"
        action={`/@${encodeURIComponent(props.handle)}/remote-follow`}
      >
        <input type="hidden" name={LOCALE_QUERY_PARAM} value={props.locale} />
        <div class="field">
          <label class="sr-only" for="remote-follow-acct">
            {heading}
          </label>
          <div class="control">
            <input
              type="text"
              id="remote-follow-acct"
              name="acct"
              placeholder={translate(
                props.i18n,
                copy.federationRemoteFollowPlaceholder,
              )}
              autocomplete="off"
              required
            />
            <button type="submit" class="btn btn-primary">
              {translate(props.i18n, copy.federationRemoteFollowButton)}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
};

const RemoteFollowErrorPage: FC<{
  actorHandle: string;
  actorName: string;
  ctx: PageContext;
}> = (props) => {
  const title = translate(props.ctx.i18n, copy.federationRemoteFollowTitle);
  const invalidAccount = translate(
    props.ctx.i18n,
    copy.federationRemoteFollowInvalidAccount,
  );
  return (
    <Layout ctx={props.ctx} title={title}>
      <div class="page-head">
        <h1>{title}</h1>
      </div>
      <section class="panel actor-message-head">
        <Notice kind="error" live="alert">
          <p>{invalidAccount}</p>
        </Notice>
        <div class="form-actions">
          <a
            class="btn btn-quiet"
            href={`/@${encodeURIComponent(props.actorHandle)}`}
          >
            {translate(props.ctx.i18n, copy.federationBackToActor, {
              name: props.actorName,
            })}
          </a>
        </div>
      </section>
    </Layout>
  );
};

/** List-view preview from a sanitized summary or a plain-text Note teaser. */
function listPreviewHtml(object: StoredFederationObject): string {
  if (object.summaryHtml !== null) {
    return sanitizeFeedHtml(object.summaryHtml);
  }
  const snippet = truncateText(
    stripHtml(object.contentHtml),
    ContentPolicy.DEFAULT.teaserMaxChars,
  );
  return snippet.length === 0 ? "" : `<p>${escapeHtml(snippet)}</p>`;
}

function fallbackTitle(object: StoredFederationObject, i18n: I18n): string {
  if (object.name !== null) return object.name;
  return translate(
    i18n,
    object.kind === "note"
      ? copy.federationPostFallback
      : copy.federationArticleFallback,
  );
}

const MessageCard: FC<{
  handle: string;
  object: StoredFederationObject;
  i18n: I18n;
}> = (props) => {
  const title = fallbackTitle(props.object, props.i18n);
  const preview = listPreviewHtml(props.object);
  return (
    <article class="panel actor-post">
      <h2>
        <a
          href={`/@${encodeURIComponent(props.handle)}/${encodeURIComponent(props.object.id)}`}
        >
          {title}
        </a>
      </h2>
      {preview.length > 0 && <div class="content">{raw(preview)}</div>}
      <time class="quiet" datetime={props.object.publishedAt.toISOString()}>
        {formatDate(props.i18n.locale, props.object.publishedAt)}
      </time>
    </article>
  );
};

const MessagePage: FC<{
  handle: string;
  actorName: string;
  iconUrl: string | null;
  object: StoredFederationObject;
  ctx: PageContext;
}> = (props) => {
  const title = fallbackTitle(props.object, props.ctx.i18n);
  const source = absoluteUrl(props.object.sourceUrl);
  return (
    <Layout ctx={props.ctx} title={title}>
      <header class="panel actor-message-head">
        <div class="actor-author">
          <ActorAvatar iconUrl={props.iconUrl} variant="inline" />
          <div>
            <p class="actor-author-name">
              <a href={`/@${encodeURIComponent(props.handle)}`}>
                {props.actorName}
              </a>
            </p>
            <p class="feed-meta">
              <span class="handle">
                @{props.handle}@{props.ctx.host}
              </span>
            </p>
          </div>
        </div>
        <h1>{title}</h1>
        {props.object.summaryHtml !== null && (
          <div class="content">
            {raw(sanitizeFeedHtml(props.object.summaryHtml))}
          </div>
        )}
        <time class="quiet" datetime={props.object.publishedAt.toISOString()}>
          {formatDate(props.ctx.i18n.locale, props.object.publishedAt)}
        </time>
      </header>
      <article class="panel actor-post-body">
        <div class="content">
          {raw(sanitizeFeedHtml(props.object.contentHtml))}
        </div>
        {source !== null && (
          <p>
            <a class="btn btn-secondary" href={source.href}>
              {translate(props.ctx.i18n, copy.federationViewOriginal)}
            </a>
          </p>
        )}
      </article>
    </Layout>
  );
};

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
    const ctx = pageContext(c, deps.origin, host);
    let name: string;
    let summary: string;
    let icon: string | null;
    if (rawHandle === MAIN_ACTOR_HANDLE) {
      name = "rss2.pub";
      summary = `<p>${escapeHtml(translate(ctx.i18n, copy.federationMainActorSummary))}</p>`;
      icon = null;
    } else {
      const handle = Handle.create(rawHandle);
      if (isErr(handle)) return c.notFound();
      const feed = await deps.feeds.findByHandle(handle.value);
      if (feed === null) return c.notFound();
      name = Feed.displayName(feed);
      summary = sanitizeFeedHtml(renderFeedProfileHtml(feed));
      icon = feed.iconUrl;
    }

    const followers = await deps.federationObjects.countFollowers(rawHandle);
    const posts = await deps.federationObjects.listObjects(rawHandle, null, 20);
    return c.html(
      <Layout
        ctx={ctx}
        title={rawHandle === MAIN_ACTOR_HANDLE ? undefined : name}
      >
        <header class="panel actor-profile">
          <ActorAvatar iconUrl={icon} variant="profile" />
          <h1>{name}</h1>
          <p class="feed-meta">
            <span class="handle">
              @{rawHandle}@{host}
            </span>
            <span class="feed-stat">
              {translate(ctx.i18n, copy.feedFollowers, { count: followers })}
            </span>
          </p>
          <div class="content">{raw(summary)}</div>
        </header>
        <RemoteFollowForm
          handle={rawHandle}
          i18n={ctx.i18n}
          locale={ctx.locale}
        />
        {posts.items.length === 0 ? (
          <div class="empty-state">
            <p class="empty-title">
              {translate(ctx.i18n, copy.federationNoPostsTitle)}
            </p>
            <p class="help">
              {translate(ctx.i18n, copy.federationNoPostsBody)}
            </p>
          </div>
        ) : (
          <ul class="posts" role="list">
            {posts.items.map((object) => (
              <li>
                <MessageCard
                  handle={rawHandle}
                  object={object}
                  i18n={ctx.i18n}
                />
              </li>
            ))}
          </ul>
        )}
      </Layout>,
    );
  });

  app.get("/:actor/remote-follow", negotiateLocale, async (c) => {
    const actor = c.req.param("actor");
    if (!actor.startsWith("@")) return c.notFound();
    const rawHandle = actor.slice(1);
    const ctx = pageContext(c, deps.origin, host);
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
        <RemoteFollowErrorPage
          actorHandle={rawHandle}
          actorName={actorName}
          ctx={ctx}
        />,
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
        <RemoteFollowErrorPage
          actorHandle={rawHandle}
          actorName={actorName}
          ctx={ctx}
        />,
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
    return object === null
      ? c.notFound()
      : c.html(
          <MessagePage
            handle={handle}
            actorName={actorName}
            iconUrl={iconUrl}
            object={object}
            ctx={pageContext(c, deps.origin, host)}
          />,
        );
  });

  return app;
}
