import type { FC } from "hono/jsx";
import type { Feed } from "../../domain/feed/feed.js";
import type { PopularFeed } from "../../domain/ports/feed-repository.js";
import { translate, translateWithSlots } from "../i18n.js";
import {
  FeedCard,
  FeedList,
  HandleToCopy,
  Notice,
  type RegisterDraft,
  RegisterForm,
  SearchForm,
} from "./components.js";
import { Layout, type PageContext } from "./layout.js";
import { copy } from "./messages.js";

/**
 * Home. Reading order matches task order: what this is → the one action most
 * visitors came for (register) → what other people already follow (discover).
 * The bot command is a *second* route to the same action, so it sits under
 * the form as a footnote rather than in the page's opening sentence.
 */
export const HomePage: FC<{
  ctx: PageContext;
  popular: PopularFeed[];
  /**
   * True when the instance has more feeds than this page shows. Drives the
   * link to the full list rather than being guessed from `popular.length`,
   * which cannot tell "eight feeds exist" from "eight of forty".
   */
  morePopular?: boolean;
  /** Present only when a submission bounced; refills and explains the form. */
  draft?: RegisterDraft | undefined;
}> = (props) => (
  <Layout ctx={props.ctx} nav="home">
    <div class="page-head">
      <h1>{translate(props.ctx.i18n, copy.homeHeading)}</h1>
      <p class="lede">{translate(props.ctx.i18n, copy.homeLede)}</p>
    </div>

    <section class="panel" aria-labelledby="register-heading">
      <div class="panel-head">
        <h2 id="register-heading">
          {translate(props.ctx.i18n, copy.registerHeading)}
        </h2>
      </div>
      <RegisterForm ctx={props.ctx} draft={props.draft} />
      <p class="help panel-note">
        {translateWithSlots(props.ctx.i18n, copy.registerBotAlt, {
          handle: <span class="chip">@rss2pub@{props.ctx.host}</span>,
          command: <code class="chip">register &lt;url&gt;</code>,
        })}
      </p>
    </section>

    {/* Discovery, and deliberately the last thing on the page: it is what a
        visitor reads *instead of* acting, so it neither opens the page nor
        outgrows it. Only a screenful of it lives here; /search holds the
        rest. */}
    <section class="panel" aria-labelledby="popular-heading">
      <div class="section-head">
        <h2 id="popular-heading">
          {translate(props.ctx.i18n, copy.feedPopularHeading)}
        </h2>
        <SearchForm ctx={props.ctx} compact />
      </div>
      {props.popular.length === 0 ? (
        <div class="empty-state">
          <p class="empty-title">
            {translate(props.ctx.i18n, copy.feedPopularEmpty)}
          </p>
          <p class="help">
            {translate(props.ctx.i18n, copy.homePopularEmptyHint)}
          </p>
        </div>
      ) : (
        <>
          <FeedList>
            {props.popular.map((entry) => (
              <FeedCard
                ctx={props.ctx}
                feed={entry.feed}
                followers={entry.followerCount}
              />
            ))}
          </FeedList>
          {props.morePopular === true && (
            <a class="btn btn-quiet section-more" href="/search">
              {translate(props.ctx.i18n, copy.feedPopularMore)}
            </a>
          )}
        </>
      )}
    </section>
  </Layout>
);

/**
 * What the search page is showing. A blank query is not a failed search, so
 * it gets a state of its own rather than being flattened into "no results":
 * nobody has asked anything yet, and the useful answer is the same list the
 * home page teases — in full, this time. That also gives the home page's
 * "See more feeds" link somewhere to land, which is the only route this
 * product has to *browse* rather than search.
 */
export type SearchState =
  | { readonly kind: "browse"; readonly popular: PopularFeed[] }
  | {
      readonly kind: "results";
      readonly query: string;
      readonly results: Feed[];
    };

/**
 * Search. The form is a panel of its own and the answer is a second one, so
 * the page has the same two-panel rhythm in all three of its states: browse
 * (no query yet), hits (a count that names the section), and no hits (why,
 * plus a way out — registering the feed, which is what the searcher usually
 * wants).
 */
export const SearchPage: FC<{
  ctx: PageContext;
  state: SearchState;
}> = (props) => (
  <Layout ctx={props.ctx} title={copy.searchHeading} nav="search">
    <div class="page-head">
      <h1>{translate(props.ctx.i18n, copy.searchHeading)}</h1>
    </div>
    <section class="panel">
      <SearchForm
        ctx={props.ctx}
        query={props.state.kind === "results" ? props.state.query : ""}
      />
    </section>
    {props.state.kind === "browse" ? (
      <section class="panel" aria-labelledby="popular-heading">
        <h2 id="popular-heading">
          {translate(props.ctx.i18n, copy.feedPopularHeading)}
        </h2>
        {props.state.popular.length === 0 ? (
          <div class="empty-state">
            <p class="empty-title">
              {translate(props.ctx.i18n, copy.feedPopularEmpty)}
            </p>
            <a class="btn btn-secondary" href="/">
              {translate(props.ctx.i18n, copy.searchEmptyAction)}
            </a>
          </div>
        ) : (
          <FeedList>
            {props.state.popular.map((entry) => (
              <FeedCard
                ctx={props.ctx}
                feed={entry.feed}
                followers={entry.followerCount}
              />
            ))}
          </FeedList>
        )}
      </section>
    ) : props.state.results.length === 0 ? (
      <section class="panel">
        <div class="empty-state">
          <p class="empty-title">
            {translate(props.ctx.i18n, copy.searchEmptyTitle, {
              query: props.state.query,
            })}
          </p>
          <p class="help">
            {translate(props.ctx.i18n, copy.searchEmptyHint)}
          </p>
          <a class="btn btn-secondary" href="/">
            {translate(props.ctx.i18n, copy.searchEmptyAction)}
          </a>
        </div>
      </section>
    ) : (
      /* The count is both the announcement and the section's accessible
         name: one string, said once, in the place a sighted reader looks
         and in the place a screen reader looks. */
      <section class="panel" aria-labelledby="results-count">
        <p class="help" id="results-count" role="status">
          {translate(props.ctx.i18n, copy.searchResultsCount, {
            count: props.state.results.length,
            query: props.state.query,
          })}
        </p>
        <FeedList>
          {props.state.results.map((feed) => (
            <FeedCard ctx={props.ctx} feed={feed} level={2} />
          ))}
        </FeedList>
      </section>
    )}
  </Layout>
);

/**
 * Registration succeeded (or had already succeeded earlier). Registering is
 * only half the job — the feed does nothing until someone follows it — so
 * the page's centre of gravity is the two steps that finish the task, with
 * the account name one click away from the clipboard.
 */
export const RegisterResultPage: FC<{
  ctx: PageContext;
  outcome: { kind: "created" | "exists"; feed: Feed };
}> = (props) => {
  const created = props.outcome.kind === "created";
  return (
    <Layout ctx={props.ctx} title={copy.registerResultHeading}>
      {/* The outcome *is* the page title — the document title keeps the
          generic "Feed registration" so history entries stay scannable. */}
      <div class="page-head">
        <h1>
          {translate(
            props.ctx.i18n,
            created
              ? copy.registerResultCreatedTitle
              : copy.registerResultExistsTitle,
          )}
        </h1>
      </div>
      <section class="panel">
        <Notice kind="success" live="status">
          <p>
            {translate(
              props.ctx.i18n,
              created ? copy.registerResultCreated : copy.registerResultExists,
            )}
          </p>
        </Notice>
        <FeedList>
          {/* Handle omitted: the copy row below is the one place it should
              be read from on this page. */}
          <FeedCard
            ctx={props.ctx}
            feed={props.outcome.feed}
            level={2}
            omitHandle
          />
        </FeedList>
      </section>

      <section class="panel" aria-labelledby="follow-heading">
        <h2 id="follow-heading">
          {translate(props.ctx.i18n, copy.registerNextHeading)}
        </h2>
        <ol class="steps" role="list">
          <li>
            <div class="step-body">
              <p>{translate(props.ctx.i18n, copy.registerNextCopy)}</p>
              <HandleToCopy ctx={props.ctx} handle={props.outcome.feed.handle} />
            </div>
          </li>
          <li>
            <div class="step-body">
              <p>{translate(props.ctx.i18n, copy.registerNextFollow)}</p>
            </div>
          </li>
        </ol>
        {/* Three tiers, in the order the task needs them: copying the handle
            above is primary, seeing the account is a useful follow-up, and
            registering another feed is a way out rather than a next step. */}
        <div class="form-actions">
          <a
            class="btn btn-secondary"
            href={`/@${encodeURIComponent(props.outcome.feed.handle)}`}
          >
            {translate(props.ctx.i18n, copy.registerOpenProfile)}
          </a>
          <a class="btn btn-quiet" href="/">
            {translate(props.ctx.i18n, copy.registerAnother)}
          </a>
        </div>
      </section>
    </Layout>
  );
};
