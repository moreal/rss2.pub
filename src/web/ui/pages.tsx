import type { FC } from "hono/jsx";
import { raw } from "hono/html";
import {
  renderHomeBody, renderRegisterResultBody, renderSearchBody,
  type HomeViewModel, type RegistrationViewModel, type SearchViewModel,
} from "@rss2pub/web-ui/server";
import { Feed } from "../../domain/feed/feed.js";
import type { PopularFeed } from "../../domain/ports/feed-repository.js";
import { translate, translateWithSlots } from "../i18n.js";
import type { PageContext } from "../page-context.js";
import { Layout } from "./layout.js";
import { copy } from "./messages.js";

type FeedCardData = RegistrationViewModel["feed"];
type RegisterDraft = { readonly url: string; readonly error?: string };

function feedCard(feed: Feed): FeedCardData {
  return {
    handle: feed.handle,
    title: Feed.displayName(feed),
    description: feed.description,
    url: feed.url,
    iconUrl: feed.iconUrl,
    href: `/@${encodeURIComponent(feed.handle)}`,
  };
}

function popularFeeds(ctx: PageContext, popular: PopularFeed[]): HomeViewModel["popular"]["feeds"] {
  return popular.map(({ feed, followerCount }) => ({
    feed: feedCard(feed),
    followersLabel: translate(ctx.i18n, copy.feedFollowers, { count: followerCount }),
  }));
}

function searchForm(ctx: PageContext): HomeViewModel["search"] {
  return {
    label: translate(ctx.i18n, copy.searchLabel),
    placeholder: translate(ctx.i18n, copy.searchPlaceholder),
    button: translate(ctx.i18n, copy.searchButton),
    help: translate(ctx.i18n, copy.searchHelp),
  };
}

function homeModel(
  ctx: PageContext, popular: PopularFeed[], morePopular: boolean, draft?: RegisterDraft,
): HomeViewModel {
  return {
    host: ctx.host,
    heading: translate(ctx.i18n, copy.homeHeading),
    lede: translate(ctx.i18n, copy.homeLede),
    registration: {
      heading: translate(ctx.i18n, copy.registerHeading),
      urlLabel: translate(ctx.i18n, copy.registerUrlLabel),
      urlHelp: translate(ctx.i18n, copy.registerUrlHelp),
      submitLabel: translate(ctx.i18n, copy.registerButton),
      pendingLabel: translate(ctx.i18n, copy.registerPending),
      errorHeading: translate(ctx.i18n, copy.registerErrorHeading),
      errorHint: translate(ctx.i18n, copy.registerErrorHint),
      ...(draft === undefined ? {} : { draft }),
    },
    botAlternative: translateWithSlots<HomeViewModel["botAlternative"][number]>(
      ctx.i18n, copy.registerBotAlt, {
        handle: { kind: "chip", text: `@rss2pub@${ctx.host}` },
        command: { kind: "code", text: "register <url>" },
      },
    ),
    search: searchForm(ctx),
    popular: {
      heading: translate(ctx.i18n, copy.feedPopularHeading),
      feeds: popularFeeds(ctx, popular),
      emptyTitle: translate(ctx.i18n, copy.feedPopularEmpty),
      emptyHint: translate(ctx.i18n, copy.homePopularEmptyHint),
      more: morePopular,
      moreLabel: translate(ctx.i18n, copy.feedPopularMore),
    },
  };
}

/** Hono owns the document; Solid SSR owns the product body. */
export const HomePage: FC<{
  ctx: PageContext;
  popular: PopularFeed[];
  morePopular?: boolean;
  draft?: RegisterDraft | undefined;
}> = (props) => (
  <Layout ctx={props.ctx} nav="home">
    {raw(renderHomeBody(homeModel(props.ctx, props.popular, props.morePopular === true, props.draft)))}
  </Layout>
);

export type SearchState =
  | { readonly kind: "browse"; readonly popular: PopularFeed[] }
  | { readonly kind: "results"; readonly query: string; readonly results: Feed[] };

function searchModel(ctx: PageContext, state: SearchState): SearchViewModel {
  const base = {
    host: ctx.host,
    heading: translate(ctx.i18n, copy.searchHeading),
    search: searchForm(ctx),
  };
  if (state.kind === "browse") {
    return {
      ...base,
      state: {
        kind: "browse",
        heading: translate(ctx.i18n, copy.feedPopularHeading),
        feeds: popularFeeds(ctx, state.popular),
        emptyTitle: translate(ctx.i18n, copy.feedPopularEmpty),
        emptyAction: translate(ctx.i18n, copy.searchEmptyAction),
      },
    };
  }
  return {
    ...base,
    state: {
      kind: "results",
      query: state.query,
      feeds: state.results.map(feedCard),
      countLabel: translate(ctx.i18n, copy.searchResultsCount, {
        count: state.results.length, query: state.query,
      }),
      emptyTitle: translate(ctx.i18n, copy.searchEmptyTitle, { query: state.query }),
      emptyHint: translate(ctx.i18n, copy.searchEmptyHint),
      emptyAction: translate(ctx.i18n, copy.searchEmptyAction),
    },
  };
}

export const SearchPage: FC<{ ctx: PageContext; state: SearchState }> = (props) => (
  <Layout ctx={props.ctx} title={copy.searchHeading} nav="search">
    {raw(renderSearchBody(searchModel(props.ctx, props.state)))}
  </Layout>
);

function registrationModel(
  ctx: PageContext, outcome: { kind: "created" | "exists"; feed: Feed },
): RegistrationViewModel {
  const created = outcome.kind === "created";
  return {
    host: ctx.host,
    kind: outcome.kind,
    title: translate(ctx.i18n, created ? copy.registerResultCreatedTitle : copy.registerResultExistsTitle),
    status: translate(ctx.i18n, created ? copy.registerResultCreated : copy.registerResultExists),
    feed: feedCard(outcome.feed),
    nextHeading: translate(ctx.i18n, copy.registerNextHeading),
    copyInstruction: translate(ctx.i18n, copy.registerNextCopy),
    followInstruction: translate(ctx.i18n, copy.registerNextFollow),
    copyLabel: translate(ctx.i18n, copy.registerCopyButton),
    copiedLabel: translate(ctx.i18n, copy.registerCopied),
    openProfile: translate(ctx.i18n, copy.registerOpenProfile),
    anotherLabel: translate(ctx.i18n, copy.registerAnother),
  };
}

export const RegisterResultPage: FC<{
  ctx: PageContext;
  outcome: { kind: "created" | "exists"; feed: Feed };
}> = (props) => (
  <Layout ctx={props.ctx} title={copy.registerResultHeading} enter>
    {raw(renderRegisterResultBody(registrationModel(props.ctx, props.outcome)))}
  </Layout>
);
