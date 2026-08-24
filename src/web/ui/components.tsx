import type { FC, PropsWithChildren } from "hono/jsx";
import { Feed } from "../../domain/feed/feed.js";
import { translate } from "../i18n.js";
import {
  AlertIcon,
  CheckCircleIcon,
  CheckIcon,
  CopyIcon,
  RssIcon,
  SearchIcon,
} from "./icons.js";
import type { PageContext } from "./layout.js";
import { copy } from "./messages.js";

/**
 * Feedback block. The kind is carried by an icon *shape* and a bold title as
 * well as by colour, so the state survives a monochrome screen or a reader
 * who cannot distinguish the hues.
 */
export const Notice: FC<
  PropsWithChildren<{
    kind: "success" | "error" | "info";
    title?: string;
    /** `alert` interrupts; `status` waits for a pause. Omit for static prose. */
    live?: "alert" | "status";
  }>
> = (props) => (
  <div
    class={`notice notice-${props.kind}`}
    {...(props.live === undefined ? {} : { role: props.live })}
  >
    {props.kind === "success" ? (
      <CheckCircleIcon class="notice-icon" size={20} />
    ) : props.kind === "error" ? (
      <AlertIcon class="notice-icon" size={20} />
    ) : (
      <SearchIcon class="notice-icon" size={20} />
    )}
    <div class="notice-body">
      {props.title !== undefined && <p class="notice-title">{props.title}</p>}
      {props.children}
    </div>
  </div>
);

/**
 * Renders the feed's resolved favicon (ADR-0010) over a brand-mark fallback.
 * The `<img>` removes itself on load failure, uncovering the fallback — no
 * client script beyond that one inline handler is needed for SSR-only pages.
 */
const FeedAvatar: FC<{ feed: Feed }> = (props) => (
  <span class="avatar" aria-hidden="true">
    <RssIcon size={18} />
    {props.feed.iconUrl !== null && (
      <img
        src={props.feed.iconUrl}
        alt=""
        loading="lazy"
        decoding="async"
        onerror="this.remove()"
      />
    )}
  </span>
);

/** `https://` carries no information here; anything else does, so it stays. */
const displayUrl = (url: string): string => url.replace(/^https:\/\//, "");

/**
 * One row of the feed list.
 *
 * Ordering is deliberate and inverted from the first version of this UI: the
 * feed's *name* is what a reader recognises, so it is the heading and the
 * link; everything that merely describes the feed — how many people follow
 * it, its fediverse address, where it is fetched from — drops into a single
 * metadata line beneath. The title's link is stretched over the whole row so
 * the click target is large while the accessible name stays just the feed
 * name; the handle is lifted back above it so it can still be selected.
 */
export const FeedCard: FC<{
  ctx: PageContext;
  feed: Feed;
  followers?: number;
  /**
   * Depth of the feed's name in the page outline. A list under a section
   * heading nests at 3; a list that is itself the page's only content nests
   * at 2. Skipping a level would break heading navigation.
   */
  level?: 2 | 3;
  /**
   * Drops the handle from the metadata line. Set on the page that follows a
   * registration, where the very next thing on screen is the same handle in
   * a box with a copy button — printing it twice within one screenful split
   * the reader's attention across two copies of the one string that matters.
   */
  omitHandle?: boolean;
}> = (props) => {
  const Title = props.level === 2 ? "h2" : "h3";
  return (
  <li>
    <div class="feed">
      <FeedAvatar feed={props.feed} />
      <div class="feed-body">
        <Title class="feed-title">
          <a href={`/@${encodeURIComponent(props.feed.handle)}`}>
            {Feed.displayName(props.feed)}
          </a>
        </Title>
        {props.feed.description !== null && (
          <p class="feed-desc">{props.feed.description}</p>
        )}
        <p class="feed-meta">
          {props.followers !== undefined && (
            <span class="feed-stat">
              {translate(props.ctx.i18n, copy.feedFollowers, {
                count: props.followers,
              })}
            </span>
          )}
          {props.omitHandle !== true && (
            <span class="handle">
              @{props.feed.handle}@{props.ctx.host}
            </span>
          )}
          <span class="feed-src">{displayUrl(props.feed.url)}</span>
          {props.feed.fullContentEnabled && (
            <span class="tag tag-accent">
              {translate(props.ctx.i18n, copy.feedFullContentBadge)}
            </span>
          )}
        </p>
      </div>
    </div>
  </li>
  );
};

export const FeedList: FC<PropsWithChildren> = (props) => (
  <ul class="feeds">{props.children}</ul>
);

const SEARCH_HELP_ID = "search-q-help";

/**
 * Full form (visible label, help text, labelled button) on the dedicated
 * search page; a `compact` icon-only variant sits beside the "Most followed
 * feeds" heading, where the section title already says what is being
 * searched. The compact input keeps a 13rem floor so its placeholder is never
 * clipped.
 *
 * The placeholder is a list of example queries rather than a restatement of
 * the label — an echoed label teaches nothing and disappears the moment
 * anything is typed, while what people actually need to know is what kind of
 * string matches. The sentence that says so is help text, permanently visible
 * and wired up with aria-describedby, not a placeholder.
 */
export const SearchForm: FC<{
  ctx: PageContext;
  query?: string;
  compact?: boolean;
}> = (props) => {
  const id = props.compact ? "search-q-compact" : "search-q";
  const field = (
    <input
      id={id}
      type="search"
      name="q"
      placeholder={translate(props.ctx.i18n, copy.searchPlaceholder)}
      value={props.query ?? ""}
      spellcheck={false}
      autocomplete="off"
      {...(props.compact ? {} : { "aria-describedby": SEARCH_HELP_ID })}
    />
  );
  if (props.compact) {
    return (
      <form
        class="control search-compact"
        method="get"
        action="/search"
        role="search"
      >
        <label class="sr-only" for={id}>
          {translate(props.ctx.i18n, copy.searchLabel)}
        </label>
        {field}
        <button
          type="submit"
          class="btn btn-primary btn-icon"
          aria-label={translate(props.ctx.i18n, copy.searchButton)}
        >
          <SearchIcon size={20} />
        </button>
      </form>
    );
  }
  return (
    <form class="field" method="get" action="/search" role="search">
      <label class="field-label" for={id}>
        {translate(props.ctx.i18n, copy.searchLabel)}
      </label>
      <div class="control">
        {field}
        <button type="submit" class="btn btn-primary">
          {translate(props.ctx.i18n, copy.searchButton)}
        </button>
      </div>
      <p class="help" id={SEARCH_HELP_ID}>
        {translate(props.ctx.i18n, copy.searchHelp)}
      </p>
    </form>
  );
};

/** What the user typed, so a rejected submission never has to be retyped. */
export type RegisterDraft = {
  readonly url: string;
  readonly fullContentEnabled: boolean;
  /** Present only after a failed attempt; renders inline above the field. */
  readonly error?: string;
};

const ERROR_ID = "register-url-error";
const HELP_ID = "register-url-help";

export const RegisterForm: FC<{
  ctx: PageContext;
  draft?: RegisterDraft | undefined;
}> = (
  props,
) => {
  const failed = props.draft?.error !== undefined;
  return (
    <form
      class="register-form field"
      method="post"
      action="/register"
      data-pending-form
    >
      {props.draft?.error !== undefined && (
        <Notice
          kind="error"
          live="alert"
          title={translate(props.ctx.i18n, copy.registerErrorHeading)}
        >
          <p id={ERROR_ID}>{props.draft.error}</p>
          <p class="help">
            {translate(props.ctx.i18n, copy.registerErrorHint)}
          </p>
        </Notice>
      )}
      <div class="field">
        <label class="field-label" for="register-url">
          {translate(props.ctx.i18n, copy.registerUrlLabel)}
        </label>
        <input
          id="register-url"
          type="url"
          name="url"
          value={props.draft?.url ?? ""}
          placeholder="https://example.com/feed.xml"
          required
          spellcheck={false}
          autocomplete="off"
          autocapitalize="off"
          aria-describedby={failed ? `${ERROR_ID} ${HELP_ID}` : HELP_ID}
          {...(failed ? { "aria-invalid": "true", autofocus: true } : {})}
        />
        <p class="help" id={HELP_ID}>
          {translate(props.ctx.i18n, copy.registerUrlHelp)}
        </p>
      </div>
      {/* Before the button, not after it: this option changes what pressing
          the button does, so it has to be readable first. */}
      <label class="check">
        <input
          type="checkbox"
          name="full"
          value="1"
          {...(props.draft?.fullContentEnabled ? { checked: true } : {})}
        />
        <span class="check-title">
          {translate(props.ctx.i18n, copy.registerFullContentLabel)}
        </span>
        <span class="check-help">
          {translate(props.ctx.i18n, copy.registerFullContentHelp)}
        </span>
      </label>
      <div class="form-actions">
        {/* The label is a span so the enhancement can swap the text without
            touching the spinner beside it. */}
        <button
          type="submit"
          class="btn btn-primary"
          data-pending-label={translate(props.ctx.i18n, copy.registerPending)}
        >
          <span class="btn-spinner" aria-hidden="true" />
          <span data-btn-label>
            {translate(props.ctx.i18n, copy.registerButton)}
          </span>
        </button>
      </div>
      {/* Announced when the submission starts; empty until then, so it says
          nothing on first render. */}
      <span class="sr-only" role="status" data-pending-status />
    </form>
  );
};

/**
 * The account name plus a copy button. The button ships `hidden` and is
 * revealed only where the Clipboard API exists (see `COPY_SCRIPT`); without
 * it the value is still one click to select, thanks to `user-select: all`.
 *
 * Primary weight, and not `btn-sm`: copying this string is the whole job of
 * the page it appears on. It previously rendered as a small secondary button
 * while an "Open the account page" link below it took the primary fill —
 * which pointed the eye at the optional action instead of the required one.
 */
export const HandleToCopy: FC<{ ctx: PageContext; handle: string }> = (
  props,
) => {
  const copyLabel = translate(props.ctx.i18n, copy.registerCopyButton);
  const full = `@${props.handle}@${props.ctx.host}`;
  return (
    <p class="copy-row">
      {/* Split at the host boundary so a handle too wide for a phone wraps
          where the address has a seam, instead of mid-domain ("…@rss2.p /
          ub"). <wbr> is a break opportunity only — it adds nothing to the
          selection, and the button copies from data-copy regardless. */}
      <span class="handle-value">
        @{props.handle}
        <wbr />@{props.ctx.host}
      </span>
      <button
        type="button"
        class="btn btn-primary copy-btn"
        hidden
        data-copy={full}
        data-copied-label={translate(props.ctx.i18n, copy.registerCopied)}
      >
        <CopyIcon class="icon-copy" size={16} />
        <CheckIcon class="icon-copied" size={16} />
        <span data-copy-label={copyLabel}>{copyLabel}</span>
      </button>
      <span class="sr-only" role="status" data-copy-status />
    </p>
  );
};
