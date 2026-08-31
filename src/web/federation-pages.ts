import { Hono } from "hono";
import { escapeHtml } from "../domain/content/html.js";
import { Feed } from "../domain/feed/feed.js";
import { Handle } from "../domain/feed/handle.js";
import type { FeedRepository } from "../domain/ports/feed-repository.js";
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
`;

function acceptsHtml(accept: string | undefined): boolean {
  return accept === undefined
    || accept.includes("text/html")
    || accept.includes("*/*");
}

function layout(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${FEDERATION_PAGE_THEME_CSS}${PAGE_CSS}</style></head><body><main>${body}</main></body></html>`;
}

function absoluteUrl(raw: string | null): URL | null {
  if (raw === null) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function messageCard(handle: string, object: StoredFederationObject): string {
  const title = object.name === null
    ? object.kind === "note" ? "Post" : "Article"
    : object.name;
  const summary = object.summaryHtml === null
    ? ""
    : `<div class="content">${sanitizeFeedHtml(object.summaryHtml)}</div>`;
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
    `<header><p><a href="/@${encodeURIComponent(handle)}">@${escapeHtml(handle)}</a></p><h1>${escapeHtml(title)}</h1>${summary}<p class="muted">${escapeHtml(object.publishedAt.toISOString())}</p></header><article><div class="content">${sanitizeFeedHtml(object.contentHtml)}</div>${sourceLink}</article>`,
  );
}

export function createFederationPages(deps: {
  readonly origin: string;
  readonly feeds: FeedRepository;
  readonly federationObjects: FederationRepository;
}): Hono {
  const app = new Hono();
  const host = new URL(deps.origin).host;

  app.get("/:actor", async (c) => {
    if (!acceptsHtml(c.req.header("accept"))) return c.body(null, 406);
    const actor = c.req.param("actor");
    if (!actor.startsWith("@")) return c.notFound();
    const rawHandle = actor.slice(1);
    let name: string;
    let summary: string;
    let icon: string | null;
    if (rawHandle === MAIN_ACTOR_HANDLE) {
      name = "rss2.pub";
      summary = "<p>I turn Atom feeds into followable accounts. Mention me with register or search commands.</p>";
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
    const body = `<header>${avatar}<h1>${escapeHtml(name)}</h1><p class="muted">@${escapeHtml(rawHandle)}@${escapeHtml(host)}</p><div class="content">${summary}</div><p>${followers} ${followers === 1 ? "follower" : "followers"}</p></header><section class="posts">${posts.items.map((object) => messageCard(rawHandle, object)).join("")}</section>`;
    return c.html(layout(name, body));
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
