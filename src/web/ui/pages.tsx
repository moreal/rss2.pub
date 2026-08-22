import type { FC } from "hono/jsx";
import { Feed } from "../../domain/feed/feed.js";
import type { PopularFeed } from "../../domain/ports/feed-repository.js";
import { translate, translateWithSlots } from "../i18n.js";
import { Layout, type PageContext } from "./layout.js";
import { copy } from "./messages.js";

const SearchForm: FC<{ ctx: PageContext; query?: string }> = (props) => (
  <form class="row" method="get" action="/search">
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
    <button type="submit">{translate(props.ctx.i18n, copy.searchButton)}</button>
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

const FeedLine: FC<{
  ctx: PageContext;
  feed: Feed;
  followers?: number;
}> = (props) => (
  <li>
    <a class="feed-card" href={`/@${encodeURIComponent(props.feed.handle)}`}>
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
    </a>
  </li>
);

export const HomePage: FC<{ ctx: PageContext; popular: PopularFeed[] }> = (
  props,
) => (
  <Layout ctx={props.ctx}>
    <section>
      <h2>{translate(props.ctx.i18n, copy.registerHeading)}</h2>
      <RegisterForm ctx={props.ctx} />
    </section>
    <section>
      <h2>{translate(props.ctx.i18n, copy.searchHeading)}</h2>
      <SearchForm ctx={props.ctx} />
    </section>
    <section>
      <h2>{translate(props.ctx.i18n, copy.homePopularHeading)}</h2>
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
    </section>
    <section>
      {props.results.length === 0 ? (
        <p class="notice">
          {translate(props.ctx.i18n, copy.searchEmpty, { query: props.query })}
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
        <p class="notice error">{props.outcome.message}</p>
      ) : (
        <>
          <p class="notice">
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
