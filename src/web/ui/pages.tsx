import type { FC, PropsWithChildren } from "hono/jsx";
import { Feed } from "../../domain/feed/feed.js";
import type { PopularFeed } from "../../domain/ports/feed-repository.js";

const STYLE = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, sans-serif;
    margin: 0 auto; padding: 1.5rem 1rem 4rem;
    max-width: 42rem; line-height: 1.55;
  }
  header.site { margin-bottom: 2rem; }
  header.site h1 { margin: 0; font-size: 1.6rem; }
  header.site h1 a { color: inherit; text-decoration: none; }
  header.site p { margin: 0.25rem 0 0; opacity: 0.75; }
  form.row { display: flex; gap: 0.5rem; margin: 0.75rem 0 1.5rem; }
  form.row input[type="text"], form.row input[type="url"] {
    flex: 1; padding: 0.5rem 0.75rem; font-size: 1rem;
    border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    border-radius: 0.5rem; background: transparent; color: inherit;
  }
  form.row button {
    padding: 0.5rem 1rem; font-size: 1rem; border: none;
    border-radius: 0.5rem; cursor: pointer;
  }
  ul.feeds { list-style: none; margin: 0; padding: 0; }
  ul.feeds li {
    padding: 0.75rem 0;
    border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  }
  .handle { font-family: ui-monospace, monospace; font-size: 0.95rem; }
  .meta { opacity: 0.7; font-size: 0.9rem; }
  .badge { font-variant-numeric: tabular-nums; opacity: 0.8; float: right; }
  .notice { padding: 0.75rem 1rem; border-radius: 0.5rem;
    border: 1px solid color-mix(in srgb, currentColor 25%, transparent); }
  h2 { font-size: 1.15rem; margin: 2rem 0 0.5rem; }
`;

export const Layout: FC<PropsWithChildren<{ host: string }>> = (props) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>rss2.pub</title>
      <style>{STYLE}</style>
    </head>
    <body>
      <header class="site">
        <h1>
          <a href="/">rss2.pub</a>
        </h1>
        <p>
          Follow RSS/Atom feeds from the fediverse. Mention{" "}
          <span class="handle">@rss2pub@{props.host}</span> with{" "}
          <code>register &lt;url&gt;</code> or use the form below.
        </p>
      </header>
      {props.children}
    </body>
  </html>
);

const SearchForm: FC<{ query?: string }> = (props) => (
  <form class="row" method="get" action="/search">
    <input
      type="text"
      name="q"
      placeholder="Search registered feeds…"
      value={props.query ?? ""}
    />
    <button type="submit">Search</button>
  </form>
);

const RegisterForm: FC = () => (
  <form class="row" method="post" action="/register">
    <input type="url" name="url" placeholder="https://example.com/feed.xml" required />
    <button type="submit">Register feed</button>
  </form>
);

const FeedLine: FC<{ feed: Feed; host: string; followers?: number }> = (
  props,
) => (
  <li>
    {props.followers !== undefined && (
      <span class="badge">{props.followers} followers</span>
    )}
    <div class="handle">
      @{props.feed.handle}@{props.host}
    </div>
    <div>{Feed.displayName(props.feed)}</div>
    {props.feed.description !== null && (
      <div class="meta">{props.feed.description}</div>
    )}
    <div class="meta">{props.feed.url}</div>
  </li>
);

export const HomePage: FC<{ host: string; popular: PopularFeed[] }> = (
  props,
) => (
  <Layout host={props.host}>
    <h2>Register a feed</h2>
    <RegisterForm />
    <h2>Search</h2>
    <SearchForm />
    <h2>Most followed feeds</h2>
    {props.popular.length === 0 ? (
      <p class="meta">No feeds yet — register the first one!</p>
    ) : (
      <ul class="feeds">
        {props.popular.map((entry) => (
          <FeedLine
            feed={entry.feed}
            host={props.host}
            followers={entry.followerCount}
          />
        ))}
      </ul>
    )}
  </Layout>
);

export const SearchPage: FC<{
  host: string;
  query: string;
  results: Feed[];
}> = (props) => (
  <Layout host={props.host}>
    <h2>Search</h2>
    <SearchForm query={props.query} />
    {props.results.length === 0 ? (
      <p class="notice">
        No feeds matched “{props.query}”. Register one above or via the bot.
      </p>
    ) : (
      <ul class="feeds">
        {props.results.map((feed) => (
          <FeedLine feed={feed} host={props.host} />
        ))}
      </ul>
    )}
  </Layout>
);

export const RegisterResultPage: FC<{
  host: string;
  outcome:
    | { kind: "created" | "exists"; feed: Feed }
    | { kind: "error"; message: string };
}> = (props) => (
  <Layout host={props.host}>
    <h2>Feed registration</h2>
    {props.outcome.kind === "error" ? (
      <p class="notice">{props.outcome.message}</p>
    ) : (
      <>
        <p class="notice">
          {props.outcome.kind === "created"
            ? "Registered! Follow "
            : "Already registered — follow "}
          <span class="handle">
            @{props.outcome.feed.handle}@{props.host}
          </span>{" "}
          from your fediverse account to get new posts.
        </p>
        <ul class="feeds">
          <FeedLine feed={props.outcome.feed} host={props.host} />
        </ul>
      </>
    )}
    <p>
      <a href="/">← back</a>
    </p>
  </Layout>
);
