/** @jsxImportSource @solidjs/web */
import type { FeedCardData } from "../feed-card-data.js";
import { AccountHandle, Button, FeedCard, FeedList, Field, Notice } from "../primitives/index.js";

/** Rendered translations are supplied by the server before Solid sees a page. */
export type InlinePart = string | { readonly kind: "chip" | "code"; readonly text: string };

export type SearchFormViewModel = {
  readonly label: string;
  readonly placeholder: string;
  readonly button: string;
  readonly help: string;
};

export type RegistrationFormViewModel = {
  readonly heading: string;
  readonly urlLabel: string;
  readonly urlHelp: string;
  readonly submitLabel: string;
  readonly pendingLabel: string;
  readonly errorHeading: string;
  readonly errorHint: string;
  readonly draft?: { readonly url: string; readonly error?: string };
};

export type PopularFeedViewModel = {
  readonly feed: FeedCardData;
  readonly followersLabel: string;
};

export type HomeViewModel = {
  readonly host: string;
  readonly heading: string;
  readonly lede: string;
  readonly registration: RegistrationFormViewModel;
  readonly botAlternative: readonly InlinePart[];
  readonly search: SearchFormViewModel;
  readonly popular: {
    readonly heading: string;
    readonly feeds: readonly PopularFeedViewModel[];
    readonly emptyTitle: string;
    readonly emptyHint: string;
    readonly more: boolean;
    readonly moreLabel: string;
  };
};

export type SearchViewModel = {
  readonly host: string;
  readonly heading: string;
  readonly search: SearchFormViewModel;
  readonly state:
    | {
        readonly kind: "browse";
        readonly heading: string;
        readonly feeds: readonly PopularFeedViewModel[];
        readonly emptyTitle: string;
        readonly emptyAction: string;
      }
    | {
        readonly kind: "results";
        readonly query: string;
        readonly feeds: readonly FeedCardData[];
        readonly countLabel: string;
        readonly emptyTitle: string;
        readonly emptyHint: string;
        readonly emptyAction: string;
      };
};

export type RegistrationViewModel = {
  readonly host: string;
  readonly kind: "created" | "exists";
  readonly title: string;
  readonly status: string;
  readonly feed: FeedCardData;
  readonly nextHeading: string;
  readonly copyInstruction: string;
  readonly followInstruction: string;
  readonly copyLabel: string;
  readonly copiedLabel: string;
  readonly openProfile: string;
  readonly anotherLabel: string;
};

function SearchIcon() {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8" /><path d="m17 17 4 4" /></svg>;
}

function SearchForm(props: { model: SearchFormViewModel; query?: string; compact?: boolean }) {
  const id = props.compact ? "search-q-compact" : "search-q";
  const field = <input id={id} type="search" name="q" placeholder={props.model.placeholder} value={props.query ?? ""} spellcheck="false" autocomplete="off" aria-describedby={props.compact ? undefined : "search-q-help"} />;
  return props.compact
    ? <form class="control search-compact" method="get" action="/search" role="search">
        <label class="sr-only" for={id}>{props.model.label}</label>
        {field}
        <Button variant="primary" type="submit" class="btn-icon" aria-label={props.model.button}><SearchIcon /></Button>
      </form>
    : <form class="field" method="get" action="/search" role="search">
        <label class="field-label" for={id}>{props.model.label}</label>
        <div class="control">{field}<Button variant="primary" type="submit">{props.model.button}</Button></div>
        <p class="help" id="search-q-help">{props.model.help}</p>
      </form>;
}

function RegistrationForm(props: { model: RegistrationFormViewModel }) {
  const failed = props.model.draft?.error !== undefined;
  return <form class="register-form field" method="post" action="/register" data-pending-form>
    {props.model.draft?.error !== undefined && <Notice kind="error" live="alert" title={props.model.errorHeading}>
      <p id="register-url-error">{props.model.draft.error}</p>
      <p class="help">{props.model.errorHint}</p>
    </Notice>}
    <Field id="register-url" type="url" name="url" label={props.model.urlLabel}
      value={props.model.draft?.url ?? ""} placeholder="https://example.com/feed.xml"
      help={props.model.urlHelp} required spellcheck="false" autocomplete="off" autocapitalize="off"
      externalErrorId={failed ? "register-url-error" : undefined} invalid={failed} autofocus={failed} />
    <div class="form-actions"><Button variant="primary" type="submit" data-pending-label={props.model.pendingLabel}>
      <span class="btn-spinner" aria-hidden="true" /><span data-btn-label>{props.model.submitLabel}</span>
    </Button></div>
    <span class="sr-only" role="status" data-pending-status />
  </form>;
}

function RichText(props: { parts: readonly InlinePart[] }) {
  return <>{props.parts.map((part) => typeof part === "string" ? part : part.kind === "code" ? <code class="chip">{part.text}</code> : <span class="chip">{part.text}</span>)}</>;
}

export function HomeBody(props: { model: HomeViewModel }) {
  const model = props.model;
  return <>
    <div class="page-head"><h1>{model.heading}</h1><p class="lede">{model.lede}</p></div>
    <section class="panel" aria-labelledby="register-heading">
      <div class="panel-head"><h2 id="register-heading">{model.registration.heading}</h2></div>
      <RegistrationForm model={model.registration} />
      <p class="help panel-note"><RichText parts={model.botAlternative} /></p>
    </section>
    <section class="panel" aria-labelledby="popular-heading">
      <div class="section-head"><h2 id="popular-heading">{model.popular.heading}</h2><SearchForm model={model.search} compact /></div>
      {model.popular.feeds.length === 0
        ? <div class="empty-state"><p class="empty-title">{model.popular.emptyTitle}</p><p class="help">{model.popular.emptyHint}</p></div>
        : <><FeedList>{model.popular.feeds.map(({ feed, followersLabel }) => <FeedCard feed={feed} host={model.host} followersLabel={followersLabel} />)}</FeedList>
            {model.popular.more && <a class="btn btn-quiet section-more" href="/search">{model.popular.moreLabel}</a>}
          </>}
    </section>
  </>;
}

export function SearchBody(props: { model: SearchViewModel }) {
  const model = props.model;
  const state = model.state;
  return <>
    <div class="page-head"><h1>{model.heading}</h1></div>
    <section class="panel"><SearchForm model={model.search} query={state.kind === "results" ? state.query : ""} /></section>
    {state.kind === "browse"
      ? <section class="panel" aria-labelledby="popular-heading"><h2 id="popular-heading">{state.heading}</h2>
          {state.feeds.length === 0
            ? <div class="empty-state"><p class="empty-title">{state.emptyTitle}</p><a class="btn btn-secondary" href="/">{state.emptyAction}</a></div>
            : <FeedList>{state.feeds.map(({ feed, followersLabel }) => <FeedCard feed={feed} host={model.host} followersLabel={followersLabel} />)}</FeedList>}
        </section>
      : state.feeds.length === 0
        ? <section class="panel"><div class="empty-state"><p class="empty-title">{state.emptyTitle}</p><p class="help">{state.emptyHint}</p><a class="btn btn-secondary" href="/">{state.emptyAction}</a></div></section>
        : <section class="panel" aria-labelledby="results-count"><p class="help" id="results-count" role="status">{state.countLabel}</p><FeedList>{state.feeds.map((feed) => <FeedCard feed={feed} host={model.host} level={2} />)}</FeedList></section>}
  </>;
}

function HandleToCopy(props: { handle: string; host: string; copyLabel: string; copiedLabel: string }) {
  return <p class="copy-row">
    <AccountHandle handle={props.handle} host={props.host} variant="copy" />
    <Button variant="primary" type="button" class="copy-btn" hidden data-copy={`@${props.handle}@${props.host}`} data-copied-label={props.copiedLabel}>
      <span class="copy-icons" aria-hidden="true"><svg class="icon-copy" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg><svg class="icon-copied" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4 4L19 6"/></svg></span>
      <span data-copy-label={props.copyLabel}>{props.copyLabel}</span>
    </Button>
    <span class="sr-only" role="status" data-copy-status />
  </p>;
}

export function RegisterResultBody(props: { model: RegistrationViewModel }) {
  const model = props.model;
  return <>
    <div class="page-head"><h1>{model.title}</h1></div>
    <section class="panel"><Notice kind="success" live="status"><p>{model.status}</p></Notice><FeedList><FeedCard feed={model.feed} host={model.host} level={2} omitHandle /></FeedList></section>
    <section class="panel" aria-labelledby="follow-heading">
      <h2 id="follow-heading">{model.nextHeading}</h2>
      <ol class="steps" role="list"><li><div class="step-body"><p>{model.copyInstruction}</p><HandleToCopy handle={model.feed.handle} host={model.host} copyLabel={model.copyLabel} copiedLabel={model.copiedLabel} /></div></li><li><div class="step-body"><p>{model.followInstruction}</p></div></li></ol>
      <div class="form-actions"><a class="btn btn-secondary" href={model.feed.href}>{model.openProfile}</a><a class="btn btn-quiet" href="/">{model.anotherLabel}</a></div>
    </section>
  </>;
}
