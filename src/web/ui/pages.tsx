import type { FC } from "hono/jsx";
import { Feed } from "../../domain/feed/feed.js";
import type { PopularFeed } from "../../domain/ports/feed-repository.js";
import { translate, translateWithSlots } from "../i18n.js";
import { Layout, type PageContext, RSS_ICON_PATH } from "./layout.js";
import { copy } from "./messages.js";

const CheckIcon: FC = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.25 14.4-4.15-4.15 1.4-1.4 2.75 2.75 5.85-5.85 1.4 1.4-7.25 7.25Z"
    />
  </svg>
);

const WarningIcon: FC = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12 2 1.5 21h21L12 2Zm0 6.1 6.15 10.65H5.85L12 8.1ZM11 11h2v4.5h-2V11Zm0 5.5h2V18h-2v-1.5Z"
    />
  </svg>
);

const SearchIcon: FC = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      fill="currentColor"
      fill-rule="evenodd"
      d="M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Zm-5.5 7.5a5.5 5.5 0 1 1 11 0 5.5 5.5 0 0 1-11 0Z"
    />
    <path fill="currentColor" d="m15.8 17.2 1.4-1.4 4.5 4.5-1.4 1.4Z" />
  </svg>
);

const ChevronIcon: FC = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      d="m9 6 6 6-6 6"
    />
  </svg>
);

/**
 * Full form (with a labelled button) on the dedicated search page; a
 * `compact` icon-only variant doubles as a "jump to search" shortcut in the
 * home page's feed-list toolbar, where the heading is "Most followed feeds"
 * rather than "Search".
 */
const SearchForm: FC<{
  ctx: PageContext;
  query?: string;
  compact?: boolean;
}> = (props) => (
  <form class={props.compact ? "row compact" : "row"} method="get" action="/search">
    <label class="sr-only" for="search-q">
      {translate(props.ctx.i18n, copy.searchLabel)}
    </label>
    <input
      id="search-q"
      type="search"
      name="q"
      placeholder={translate(props.ctx.i18n, copy.searchPlaceholder)}
      value={props.query ?? ""}
      spellcheck={false}
      autocomplete="off"
    />
    <button
      type="submit"
      aria-label={
        props.compact ? translate(props.ctx.i18n, copy.searchButton) : undefined
      }
    >
      {props.compact ? (
        <SearchIcon />
      ) : (
        translate(props.ctx.i18n, copy.searchButton)
      )}
    </button>
  </form>
);

const RegisterForm: FC<{ ctx: PageContext }> = (props) => (
  <form class="row register-form" method="post" action="/register">
    <label class="sr-only" for="register-url">
      {translate(props.ctx.i18n, copy.registerUrlLabel)}
    </label>
    <input
      id="register-url"
      type="url"
      name="url"
      placeholder="https://example.com/feed.xml"
      required
      spellcheck={false}
      autocomplete="off"
      autocapitalize="off"
    />
    <button type="submit">
      {translate(props.ctx.i18n, copy.registerButton)}
    </button>
    <label class="checkbox-row">
      <input id="register-full" type="checkbox" name="full" value="1" />
      {translate(props.ctx.i18n, copy.registerFullContentLabel)}
    </label>
  </form>
);

/**
 * Renders the feed's resolved favicon (ADR-0010) over a brand-mark fallback.
 * The `<img>` removes itself on load failure, uncovering the fallback — no
 * client script beyond that one inline handler is needed for SSR-only pages.
 */
const FeedAvatar: FC<{ feed: Feed }> = (props) => (
  <span class="avatar" aria-hidden="true">
    <svg viewBox="0 0 24 24">
      <path fill="currentColor" d={RSS_ICON_PATH} />
    </svg>
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

const FeedLine: FC<{
  ctx: PageContext;
  feed: Feed;
  followers?: number;
}> = (props) => (
  <li>
    <a class="feed-card" href={`/@${encodeURIComponent(props.feed.handle)}`}>
      <div class="feed-row">
        <FeedAvatar feed={props.feed} />
        <div class="feed-main">
          <div class="feed-top">
            <span class="handle">
              @{props.feed.handle}@{props.ctx.host}
            </span>
            <span class="badges">
              {props.feed.fullContentEnabled && (
                <span class="badge badge-full-content">
                  {translate(props.ctx.i18n, copy.feedFullContentBadge)}
                </span>
              )}
              {props.followers !== undefined && (
                <span class="badge">
                  {translate(props.ctx.i18n, copy.feedFollowers, {
                    count: props.followers,
                  })}
                </span>
              )}
            </span>
          </div>
          <div class="feed-title">{Feed.displayName(props.feed)}</div>
          {props.feed.description !== null && (
            <p class="meta">{props.feed.description}</p>
          )}
          <div class="meta feed-url">{props.feed.url}</div>
        </div>
        <span class="feed-chevron">
          <ChevronIcon />
        </span>
      </div>
    </a>
  </li>
);

export const HomePage: FC<{ ctx: PageContext; popular: PopularFeed[] }> = (
  props,
) => (
  <Layout ctx={props.ctx}>
    <section class="hero">
      <h2>{translate(props.ctx.i18n, copy.registerHeading)}</h2>
      <RegisterForm ctx={props.ctx} />
    </section>
    <section>
      <div class="section-head">
        <h2>{translate(props.ctx.i18n, copy.homePopularHeading)}</h2>
        <SearchForm ctx={props.ctx} compact />
      </div>
      {props.popular.length === 0 ? (
        <p class="empty">{translate(props.ctx.i18n, copy.homePopularEmpty)}</p>
      ) : (
        <ul class="feeds">
          {props.popular.map((entry) => (
            <FeedLine
              ctx={props.ctx}
              feed={entry.feed}
              followers={entry.followerCount}
            />
          ))}
        </ul>
      )}
    </section>
  </Layout>
);

export const SearchPage: FC<{
  ctx: PageContext;
  query: string;
  results: Feed[];
}> = (props) => (
  <Layout ctx={props.ctx} title={copy.searchHeading}>
    <section>
      <h2>{translate(props.ctx.i18n, copy.searchHeading)}</h2>
      <SearchForm ctx={props.ctx} query={props.query} />
      {props.results.length === 0 ? (
        <p class="notice">
          <SearchIcon />
          <span>
            {translate(props.ctx.i18n, copy.searchEmpty, { query: props.query })}
          </span>
        </p>
      ) : (
        <ul class="feeds">
          {props.results.map((feed) => (
            <FeedLine ctx={props.ctx} feed={feed} />
          ))}
        </ul>
      )}
    </section>
  </Layout>
);

export const RegisterResultPage: FC<{
  ctx: PageContext;
  outcome:
    | { kind: "created" | "exists"; feed: Feed }
    | { kind: "error"; message: string };
}> = (props) => (
  <Layout ctx={props.ctx} title={copy.registerResultHeading}>
    <section>
      <h2>{translate(props.ctx.i18n, copy.registerResultHeading)}</h2>
      {props.outcome.kind === "error" ? (
        <p class="notice error">
          <WarningIcon />
          <span>{props.outcome.message}</span>
        </p>
      ) : (
        <>
          <p class="notice">
            <CheckIcon />
            <span>
              {translateWithSlots(
                props.ctx.i18n,
                props.outcome.kind === "created"
                  ? copy.registerResultCreated
                  : copy.registerResultExists,
                {
                  handle: (
                    <span class="chip">
                      @{props.outcome.feed.handle}@{props.ctx.host}
                    </span>
                  ),
                },
              )}
            </span>
          </p>
          <ul class="feeds">
            <FeedLine ctx={props.ctx} feed={props.outcome.feed} />
          </ul>
        </>
      )}
    </section>
    <p class="back-link">
      <a href="/">{translate(props.ctx.i18n, copy.registerBackHome)}</a>
    </p>
  </Layout>
);
