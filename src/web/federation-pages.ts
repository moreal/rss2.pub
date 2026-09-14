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
import { RSS_ICON_PATH } from "./ui/icons.js";
import { copy } from "./ui/messages.js";

const PAGE_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--fed-bg); color: var(--fed-text); font-family: var(--fed-font); }
  main { width: min(46rem, calc(100% - 2rem)); margin: 2rem auto; }
  article, header, .panel { background: var(--fed-surface); border: 1px solid var(--fed-border); border-radius: var(--fed-radius); padding: 1.25rem; }
  header, .panel { margin-bottom: var(--fed-space-4); }
  .panel { display: grid; gap: var(--fed-space-3); }
  h1, h2 { margin-top: 0; }
  /* Scoped to the panel, not global: an unscoped h2 rule here would also
     shrink the post-list's own <h2> title links and any h2 a feed's
     sanitized content is allowed to carry (render.ts's sanitizer permits
     it), neither of which this redesign touches. */
  .panel h2 { font-size: 1.0625rem; }
  a { color: var(--fed-accent-ink); overflow-wrap: anywhere; }
  a:hover { color: var(--fed-accent-hover); }
  .muted { color: var(--fed-muted); }
  /* Adopts the web UI's .avatar mechanism (src/web/ui/styles.ts), not its
     exact look: this page previously rendered nothing at all when a feed
     had no icon (icon === null) — the chip and its fallback RSS glyph are
     both new here, added so every actor page reads consistently instead of
     an empty header for most freshly-registered feeds (ADR-0010 resolves an
     icon only on the first poll). The plate itself lives on .avatar img,
     not this rule: a resolved favicon's own colours are unpredictable and
     sometimes carry real alpha transparency, so its background must stay
     fixed however this page's theme falls. The fallback glyph is first-party
     art, drawn in this page's own --fed-surface-2 / --fed-accent-ink — there
     is no --fed-brand equivalent to the web UI's decorative-only --brand, so
     the two surfaces' fallback glyphs are not the same colour. */
  .avatar {
    position: relative; overflow: hidden; flex: none;
    display: grid; place-items: center;
    width: 4rem; height: 4rem; margin-bottom: var(--fed-space-3);
    border: 1px solid var(--fed-border); border-radius: var(--fed-radius-sm);
    background: var(--fed-surface-2); color: var(--fed-accent-ink);
  }
  .avatar svg { width: 2rem; height: 2rem; }
  .avatar img {
    position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: cover; background: var(--fed-avatar-plate);
    outline: 1px solid var(--fed-image-outline); outline-offset: -1px;
  }
  .posts { display: grid; gap: 1rem; }
  .content { overflow-wrap: anywhere; }

  .sr-only {
    position: absolute; width: 1px; height: 1px;
    padding: 0; margin: -1px; overflow: hidden;
    clip-path: inset(50%); white-space: nowrap; border: 0;
  }
  :focus-visible { outline: 2px solid var(--fed-focus); outline-offset: 2px; }

  /* ---------- breadcrumb ---------- */
  nav.crumbs { margin: 0 0 var(--fed-space-4); }
  nav.crumbs ol {
    list-style: none; display: flex; flex-wrap: wrap; align-items: center;
    margin: 0; padding: 0; font-size: var(--fed-text-sm);
  }
  nav.crumbs li { display: flex; align-items: center; min-width: 0; }
  nav.crumbs li + li::before {
    content: "›"; margin: 0 var(--fed-space-2); color: var(--fed-muted);
  }
  /* text-overflow only ever applies to a block container's own overflowing
     inline content — never to a flex/inline-flex container itself, which is
     what <a> and the current <li> are for alignment. The label lives in its
     own block-level child so the ellipsis actually renders instead of a
     hard, unmarked clip. */
  .crumb-label {
    display: block; min-width: 0; max-width: 16rem;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  nav.crumbs a {
    display: inline-flex; align-items: center; min-height: 1.75rem;
    padding-inline: 0.3rem; margin-inline: -0.3rem;
    border-radius: var(--fed-radius-sm);
    color: var(--fed-muted); text-decoration: none;
  }
  nav.crumbs a:hover { color: var(--fed-accent-ink); background: var(--fed-surface-2); }
  nav.crumbs li[aria-current] { color: var(--fed-text); font-weight: var(--fed-weight-medium); }

  /* ---------- remote follow ---------- */
  .field { display: grid; gap: var(--fed-space-2); }
  .control { display: flex; gap: var(--fed-space-2); flex-wrap: wrap; }
  .control input[type="text"] {
    flex: 1 1 12rem; min-width: 0; min-height: var(--fed-tap);
    padding: 0.5rem 0.75rem; font: inherit;
    color: var(--fed-text); background: var(--fed-surface);
    border: 1px solid var(--fed-border-strong); border-radius: var(--fed-radius-sm);
    transition: border-color 0.12s ease, box-shadow 0.12s ease;
  }
  .control input::placeholder { color: var(--fed-muted); }
  /* The global :focus-visible outline below stays on top of this: a
     forced-colors mode (e.g. Windows High Contrast) suppresses authored
     box-shadow and normalizes border colour, so outline is the only
     indicator that survives there. */
  .control input:focus-visible {
    border-color: var(--fed-accent);
    box-shadow: 0 0 0 3px var(--fed-accent-soft);
  }
  .btn {
    display: inline-flex; align-items: center; justify-content: center;
    min-height: var(--fed-tap); padding-inline: 1rem;
    font: inherit; font-weight: var(--fed-weight-medium);
    border: 1px solid transparent; border-radius: var(--fed-radius-sm);
    cursor: pointer; white-space: nowrap;
    transition: background-color 0.12s ease;
  }
  .btn-primary { background: var(--fed-accent); color: var(--fed-on-accent); }
  .btn-primary:hover { background: var(--fed-accent-hover); }
`;

function acceptsHtml(accept: string | undefined): boolean {
  return accept === undefined
    || accept.includes("text/html")
    || accept.includes("*/*");
}

function layout(title: string, body: string, locale = "en"): string {
  return `<!doctype html><html lang="${escapeHtml(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${FEDERATION_PAGE_THEME_CSS}${PAGE_CSS}</style></head><body><main>${body}</main></body></html>`;
}

/** A breadcrumb item; a trailing item without an href renders as the current page. */
type Crumb = { readonly label: string; readonly href?: string };

/**
 * Accessible breadcrumb trail, from the root page down to the current one.
 * `ariaLabel` is caller-supplied rather than a fixed English string: two of
 * this function's three call sites already resolve a locale and translate
 * other copy on the same response, so a landmark name that stayed English
 * regardless would be announced in the wrong language on those pages.
 * `messagePage()` has no locale of its own (pre-existing) and passes the
 * English fallback explicitly.
 */
function crumbs(trail: readonly Crumb[], ariaLabel: string): string {
  const items = trail
    .map((item) => item.href === undefined
      ? `<li aria-current="page"><span class="crumb-label">${escapeHtml(item.label)}</span></li>`
      : `<li><a href="${escapeHtml(item.href)}"><span class="crumb-label">${escapeHtml(item.label)}</span></a></li>`)
    .join("");
  return `<nav class="crumbs" aria-label="${escapeHtml(ariaLabel)}"><ol>${items}</ol></nav>`;
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

/**
 * Its own panel rather than a row inside the profile header: a follow
 * action is the reason a human lands on this page from a browser, not an
 * afterthought below the bio. The visible label doubles as the panel's
 * heading; the field's own <label> stays screen-reader only so the text
 * is not read twice by voice, while the input still has a real accessible
 * name of its own.
 */
function remoteFollowForm(handle: string, i18n: I18n, locale: string): string {
  const heading = escapeHtml(translate(i18n, copy.federationRemoteFollowLabel));
  const placeholder = escapeHtml(translate(i18n, copy.federationRemoteFollowPlaceholder));
  const button = escapeHtml(translate(i18n, copy.federationRemoteFollowButton));
  // A GET form only carries fields present in the markup: without this
  // hidden field, submitting the form from a Korean-rendered profile page
  // would silently drop back to English on the remote-follow response,
  // since `?lang=ko` on the profile request is never itself part of the
  // form's own query string.
  return `<section class="panel" aria-labelledby="remote-follow-heading"><h2 id="remote-follow-heading">${heading}</h2><form method="get" action="/@${encodeURIComponent(handle)}/remote-follow"><input type="hidden" name="${escapeHtml(LOCALE_QUERY_PARAM)}" value="${escapeHtml(locale)}"><div class="field"><label class="sr-only" for="remote-follow-acct">${heading}</label><div class="control"><input type="text" id="remote-follow-acct" name="acct" placeholder="${placeholder}" autocomplete="off" required><button type="submit" class="btn btn-primary">${button}</button></div></div></form></section>`;
}

function remoteFollowErrorPage(actorHandle: string, i18n: I18n, locale: string): string {
  const title = translate(i18n, copy.federationRemoteFollowTitle);
  const message = escapeHtml(translate(i18n, copy.federationRemoteFollowInvalidAccount));
  const breadcrumbLabel = translate(i18n, copy.federationBreadcrumbLabel);
  const trail: readonly Crumb[] = [
    { label: "rss2.pub", href: "/" },
    { label: `@${actorHandle}`, href: `/@${encodeURIComponent(actorHandle)}` },
    { label: title },
  ];
  return layout(
    title,
    `${crumbs(trail, breadcrumbLabel)}<header><h1>${escapeHtml(title)}</h1><p>${message}</p></header>`,
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
  const trail: readonly Crumb[] = [
    { label: "rss2.pub", href: "/" },
    { label: `@${handle}`, href: `/@${encodeURIComponent(handle)}` },
    { label: title },
  ];
  const source = absoluteUrl(object.sourceUrl);
  const sourceLink = source === null
    ? ""
    : `<p><a href="${escapeHtml(source.href)}">View original</a></p>`;
  return layout(
    title,
    // messagePage() resolves no locale of its own (pre-existing), so the
    // breadcrumb's aria-label stays the English default rather than a
    // half-translated page.
    `${crumbs(trail, "Breadcrumb")}<header><h1>${escapeHtml(title)}</h1>${summary}<p class="muted">${escapeHtml(object.publishedAt.toISOString())}</p></header><article><div class="content">${sanitizeFeedHtml(object.contentHtml)}</div>${sourceLink}</article>`,
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
    // Always draw the fallback glyph, exactly as the web UI's FeedAvatar
    // does (components.tsx): a resolved icon can still fail to load later
    // (the remote host removes it), and removing a broken <img> then reveals
    // this pre-rendered svg underneath rather than leaving an empty chip.
    const avatarFallback = `<svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true" focusable="false"><path fill="currentColor" d="${RSS_ICON_PATH}"/></svg>`;
    const avatarImage = icon === null
      ? ""
      : `<img src="${escapeHtml(icon)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`;
    const avatar = `<span class="avatar" aria-hidden="true">${avatarFallback}${avatarImage}</span>`;
    // The main actor's own display name is the string "rss2.pub" — the same
    // label the root crumb already uses. Repeating it as the current crumb
    // ("rss2.pub › rss2.pub") gives no way to tell which item is the actor
    // page, so that one case uses its @handle instead; every feed actor
    // still uses its (distinct) display name.
    const currentCrumbLabel = rawHandle === MAIN_ACTOR_HANDLE ? `@${rawHandle}` : name;
    const trail: readonly Crumb[] = [
      { label: "rss2.pub", href: "/" },
      { label: currentCrumbLabel },
    ];
    const breadcrumbLabel = translate(i18n, copy.federationBreadcrumbLabel);
    const body = `${crumbs(trail, breadcrumbLabel)}<header>${avatar}<h1>${escapeHtml(name)}</h1><p class="muted">@${escapeHtml(rawHandle)}@${escapeHtml(host)}</p><div class="content">${summary}</div><p>${followers} ${followers === 1 ? "follower" : "followers"}</p></header>${remoteFollowForm(rawHandle, i18n, locale)}<section class="posts">${posts.items.map((object) => messageCard(rawHandle, object)).join("")}</section>`;
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
