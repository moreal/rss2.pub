/** @jsxImportSource @solidjs/web */
import { AccountHandle, Avatar, Button, Notice } from "../primitives/index.js";
import { SanitizedHtml } from "./sanitized-html.js";

export { SanitizedHtml } from "./sanitized-html.js";

/** These view models contain presentation-ready text and sanitized HTML. */
export type PostPreviewModel = {
  readonly id: string;
  readonly title: string;
  readonly previewHtml: SanitizedHtml;
  readonly publishedIso: string;
  readonly publishedLabel: string;
};

export type ActorProfileModel = {
  readonly handle: string;
  readonly host: string;
  readonly name: string;
  readonly iconUrl: string | null;
  readonly summaryHtml: SanitizedHtml;
  readonly followersLabel: string;
  readonly locale: string;
  readonly followHeading: string;
  readonly followPlaceholder: string;
  readonly followButton: string;
  readonly noPostsTitle: string;
  readonly noPostsBody: string;
  readonly posts: readonly PostPreviewModel[];
};

export type MessageDetailModel = {
  readonly handle: string;
  readonly host: string;
  readonly actorName: string;
  readonly iconUrl: string | null;
  readonly title: string;
  readonly summaryHtml: SanitizedHtml | null;
  readonly contentHtml: SanitizedHtml;
  readonly publishedIso: string;
  readonly publishedLabel: string;
  readonly sourceHref: string | null;
  readonly viewOriginalLabel: string;
};

export type RemoteFollowErrorModel = {
  readonly actorHandle: string;
  readonly title: string;
  readonly invalidAccount: string;
  readonly backLabel: string;
};

function actorHref(handle: string): string {
  return `/@${encodeURIComponent(handle)}`;
}

function SanitizedContent(props: { html: SanitizedHtml }) {
  // oxlint-disable-next-line solid/no-innerhtml -- SanitizedHtml is constructed after sanitization in the web adapter.
  return <div class="content" innerHTML={props.html.value} />;
}

function RemoteFollowForm(props: { model: ActorProfileModel }) {
  return (
    <section class="panel remote-follow" aria-labelledby="remote-follow-heading">
      <h2 id="remote-follow-heading">{props.model.followHeading}</h2>
      <form method="get" action={`${actorHref(props.model.handle)}/remote-follow`}>
        <input type="hidden" name="lang" value={props.model.locale} />
        <div class="field">
          <label class="sr-only" for="remote-follow-acct">{props.model.followHeading}</label>
          <div class="control">
            <input type="text" id="remote-follow-acct" name="acct" placeholder={props.model.followPlaceholder} autocomplete="off" required />
            <Button variant="primary" type="submit">{props.model.followButton}</Button>
          </div>
        </div>
      </form>
    </section>
  );
}

function MessageCard(props: { handle: string; post: PostPreviewModel }) {
  return (
    <article class="panel actor-post">
      <h2><a href={`${actorHref(props.handle)}/${encodeURIComponent(props.post.id)}`}>{props.post.title}</a></h2>
      {props.post.previewHtml.value.length > 0 && <SanitizedContent html={props.post.previewHtml} />}
      <time class="quiet" datetime={props.post.publishedIso}>{props.post.publishedLabel}</time>
    </article>
  );
}

/** Server-rendered body; the caller owns the document shell and title. */
export function ActorProfile(props: { model: ActorProfileModel }) {
  return (
    <>
      <header class="panel actor-profile">
        <Avatar iconUrl={props.model.iconUrl} variant="profile" />
        <h1><bdi dir="auto">{props.model.name}</bdi></h1>
        <p class="feed-meta">
          <AccountHandle handle={props.model.handle} host={props.model.host} />
          <span class="feed-stat">{props.model.followersLabel}</span>
        </p>
        <SanitizedContent html={props.model.summaryHtml} />
      </header>
      <RemoteFollowForm model={props.model} />
      {props.model.posts.length === 0 ? (
        <div class="empty-state">
          <p class="empty-title">{props.model.noPostsTitle}</p>
          <p class="help">{props.model.noPostsBody}</p>
        </div>
      ) : (
        <ul class="posts" role="list">
          {props.model.posts.map((post) => <li><MessageCard handle={props.model.handle} post={post} /></li>)}
        </ul>
      )}
    </>
  );
}

/** Server-rendered body; content and summary HTML must be sanitized by the adapter. */
export function MessageDetail(props: { model: MessageDetailModel }) {
  return (
    <>
      <header class="panel actor-message-head">
        <div class="actor-author">
          <Avatar iconUrl={props.model.iconUrl} />
          <div>
            <p class="actor-author-name"><a href={actorHref(props.model.handle)}><bdi dir="auto">{props.model.actorName}</bdi></a></p>
            <p class="feed-meta"><AccountHandle handle={props.model.handle} host={props.model.host} /></p>
          </div>
        </div>
        <h1><bdi dir="auto">{props.model.title}</bdi></h1>
        {props.model.summaryHtml !== null && <SanitizedContent html={props.model.summaryHtml} />}
        <time class="quiet" datetime={props.model.publishedIso}>{props.model.publishedLabel}</time>
      </header>
      <article class="panel actor-post-body">
        <SanitizedContent html={props.model.contentHtml} />
        {props.model.sourceHref !== null && <p><a class="btn btn-secondary" href={props.model.sourceHref}>{props.model.viewOriginalLabel}</a></p>}
      </article>
    </>
  );
}

/** The caller sets HTTP status 400 and the document title. */
export function RemoteFollowError(props: { model: RemoteFollowErrorModel }) {
  return (
    <>
      <div class="page-head"><h1>{props.model.title}</h1></div>
      <section class="panel actor-message-head">
        <Notice kind="error" live="alert"><p>{props.model.invalidAccount}</p></Notice>
        <div class="form-actions"><a class="btn btn-secondary" href={actorHref(props.model.actorHandle)}>{props.model.backLabel}</a></div>
      </section>
    </>
  );
}
