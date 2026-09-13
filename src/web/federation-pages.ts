import { Hono } from "hono";
import { escapeHtml } from "../domain/content/html.js";
import { stripHtml, truncateText } from "../domain/content/html.js";
import { ContentPolicy } from "../domain/content/content-policy.js";
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
import { FEDERATION_PAGE_THEME_CSS } from "../infrastructure/federation/pages-theme.js";
import {
  renderFeedProfileHtml,
  sanitizeFeedHtml,
} from "../infrastructure/federation/render.js";
import { isErr } from "../shared/result.js";
import type { I18n } from "@lingui/core";
import { i18nFor, translate } from "./i18n.js";
import { negotiateLocale } from "./locale-middleware.js";
import { LOCALE_QUERY_PARAM, resolveLocale } from "./locale.js";
import { copy } from "./ui/messages.js";

const PAGE_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--fed-bg); color: var(--fed-text); font-family: var(--fed-font); }
  main { width: min(46rem, calc(100% - 2rem)); margin: 2rem auto; }
  article, header { background: var(--fed-surface); border: 1px solid var(--fed-border); border-radius: var(--fed-radius); padding: 1.25rem; }
  header { margin-bottom: 1rem; }
  h1, h2 { margin-top: 0; }
  a { color: var(--fed-accent-ink); overflow-wrap: anywhere; }
  .muted { color: var(--fed-muted); }
  .avatar { width: 4rem; height: 4rem; border-radius: var(--fed-radius-sm); object-fit: cover; }
  .posts { display: grid; gap: 1rem; }
  .content { overflow-wrap: anywhere; }
  .crumbs { margin: 0 0 1rem; }
  .remote-follow { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.75rem; }
  .remote-follow input { flex: 1 1 12rem; padding: 0.5rem 0.75rem; border-radius: var(--fed-radius-sm); border: 1px solid var(--fed-border); background: var(--fed-bg); color: var(--fed-text); font: inherit; }
  .remote-follow button { padding: 0.5rem 1rem; border-radius: var(--fed-radius-sm); border: 1px solid var(--fed-accent-ink); background: var(--fed-accent-ink); color: var(--fed-surface); font: inherit; cursor: pointer; }
`;

function acceptsHtml(accept: string | undefined): boolean {
  return accept === undefined
    || accept.includes("text/html")
    || accept.includes("*/*");
}

function layout(title: string, body: string, locale = "en"): string {
  return `<!doctype html><html lang="${escapeHtml(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${FEDERATION_PAGE_THEME_CSS}${PAGE_CSS}</style></head><body><main>${body}</main></body></html>`;
}

/** Root-page breadcrumb, optionally followed by a link back to the actor. */
function crumbs(actorHandle?: string): string {
  const actorLink = actorHandle === undefined
    ? ""
    : ` / <a href="/@${encodeURIComponent(actorHandle)}">@${escapeHtml(actorHandle)}</a>`;
  return `<p class="crumbs muted"><a href="/">rss2.pub</a>${actorLink}</p>`;
}

function absoluteUrl(raw: string | null): URL | null {
  if (raw === null) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/**
 * Best-effort fallback when WebFinger discovery (see
 * {@link RemoteFollowResolver}) does not yield a subscribe endpoint:
 * Mastodon's own `authorize_interaction` endpoint, guessed from the
 * account's bare domain. This is wrong for split-domain Mastodon
 * deployments and non-Mastodon software, which is exactly why the
 * WebFinger-based resolver is tried first.
 */
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

function remoteFollowForm(handle: string, i18n: I18n, locale: string): string {
  const label = escapeHtml(translate(i18n, copy.federationRemoteFollowLabel));
  const placeholder = escapeHtml(translate(i18n, copy.federationRemoteFollowPlaceholder));
  const button = escapeHtml(translate(i18n, copy.federationRemoteFollowButton));
  // A GET form only carries fields present in the markup: without this
  // hidden field, submitting the form from a Korean-rendered profile page
  // would silently drop back to English on the remote-follow response,
  // since `?lang=ko` on the profile request is never itself part of the
  // form's own query string.
  return `<form class="remote-follow" method="get" action="/@${encodeURIComponent(handle)}/remote-follow"><input type="hidden" name="${escapeHtml(LOCALE_QUERY_PARAM)}" value="${escapeHtml(locale)}"><label for="remote-follow-acct">${label}</label><input type="text" id="remote-follow-acct" name="acct" placeholder="${placeholder}" autocomplete="off" required><button type="submit">${button}</button></form>`;
}

function remoteFollowErrorPage(actorHandle: string, i18n: I18n, locale: string): string {
  const title = translate(i18n, copy.federationRemoteFollowTitle);
  const message = escapeHtml(translate(i18n, copy.federationRemoteFollowInvalidAccount));
  return layout(
    title,
    `${crumbs(actorHandle)}<header><h1>${escapeHtml(title)}</h1><p>${message}</p></header>`,
    locale,
  );
}

/**
 * List-view body preview. Article objects already carry a teaser in
 * `summaryHtml`; Note objects never do (ADR-0005 - a Note full content is
 * short enough that federated software renders it directly), so without a
 * fallback the actor page showed a bare "Post" title and no body at all.
 * Derive a plain-text snippet from the already-sanitized `contentHtml` in
 * that case.
 */
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

function messageCard(handle: string, object: StoredFederationObject): string {
  const title = object.name === null
    ? object.kind === "note" ? "Post" : "Article"
    : object.name;
  const preview = listPreviewHtml(object);
  const summary = preview.length === 0 ? "" : `<div class="content">${preview}</div>`;
  return `<article><h2><a href="/@${encodeURIComponent(handle)}/${encodeURIComponent(object.id)}">${escapeHtml(title)}</a></h2>${summary}<p class="muted">${escapeHtml(object.publishedAt.toISOString())}</p></article>`;
}

function messagePage(
  handle: string,
  object: StoredFederationObject,
): string {
  const title = object.name ?? (object.kind === "note" ? "Post" : "Article");
  const summary = object.summaryHtml === null
    ? ""
    : `<div class="content">${sanitizeFeedHtml(object.summaryHtml)}</div>`;
  const source = absoluteUrl(object.sourceUrl);
  const sourceLink = source === null
    ? ""
    : `<p><a href="${escapeHtml(source.href)}">View original</a></p>`;
  return layout(
    title,
    `${crumbs(handle)}<header><h1>${escapeHtml(title)}</h1>${summary}<p class="muted">${escapeHtml(object.publishedAt.toISOString())}</p></header><article><div class="content">${sanitizeFeedHtml(object.contentHtml)}</div>${sourceLink}</article>`,
  );
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
    const locale = resolveLocale(c.get("language"));
    const i18n = i18nFor(locale);
    let name: string;
    let summary: string;
    let icon: string | null;
    if (rawHandle === MAIN_ACTOR_HANDLE) {
      name = "rss2.pub";
      summary = "<p>I turn Atom and RSS 2.0 feeds into followable accounts. Mention me with register or search commands.</p>";
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
    const avatar = icon === null
      ? ""
      : `<img class="avatar" src="${escapeHtml(icon)}" alt="">`;
    const body = `${crumbs()}<header>${avatar}<h1>${escapeHtml(name)}</h1><p class="muted">@${escapeHtml(rawHandle)}@${escapeHtml(host)}</p><div class="content">${summary}</div><p>${followers} ${followers === 1 ? "follower" : "followers"}</p>${remoteFollowForm(rawHandle, i18n, locale)}</header><section class="posts">${posts.items.map((object) => messageCard(rawHandle, object)).join("")}</section>`;
    return c.html(layout(name, body, locale));
  });

  app.get("/:actor/remote-follow", negotiateLocale, async (c) => {
    const actor = c.req.param("actor");
    if (!actor.startsWith("@")) return c.notFound();
    const rawHandle = actor.slice(1);
    const locale = resolveLocale(c.get("language"));
    const i18n = i18nFor(locale);
    if (rawHandle !== MAIN_ACTOR_HANDLE) {
      const handle = Handle.create(rawHandle);
      if (isErr(handle) || await deps.feeds.findByHandle(handle.value) === null) {
        return c.notFound();
      }
    }
    const account = RemoteFollowAccount.create(c.req.query("acct") ?? "");
    if (isErr(account)) {
      return c.html(remoteFollowErrorPage(rawHandle, i18n, locale), 400);
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
      return c.html(remoteFollowErrorPage(rawHandle, i18n, locale), 400);
    }
    return c.redirect(target.toString(), 302);
  });

  app.get("/:actor/:id", async (c) => {
    if (!acceptsHtml(c.req.header("accept"))) return c.body(null, 406);
    const actor = c.req.param("actor");
    if (!actor.startsWith("@")) return c.notFound();
    const handle = actor.slice(1);
    const id = c.req.param("id");
    if (id === "followers") return c.notFound();
    if (handle !== MAIN_ACTOR_HANDLE) {
      const parsed = Handle.create(handle);
      if (isErr(parsed) || await deps.feeds.findByHandle(parsed.value) === null) {
        return c.notFound();
      }
    }
    const object = await deps.federationObjects.findObject(handle, id);
    return object === null ? c.notFound() : c.html(messagePage(handle, object));
  });

  return app;
}
