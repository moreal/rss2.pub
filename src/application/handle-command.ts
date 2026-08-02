import { Feed } from "../domain/feed/feed.js";
import type { RegisterFeed } from "./register-feed.js";
import type { SearchFeeds } from "./search-feeds.js";

/**
 * Commands the main actor (`rss2pub`) understands in mentions/DMs.
 * `unregister` is intentionally absent (PLAN.md 확정 사항).
 */
export type Command =
  | { readonly type: "register"; readonly url: string }
  | { readonly type: "search"; readonly keyword: string }
  | { readonly type: "help" };

const MENTION_PATTERN = /@[a-z0-9_]+(?:@[a-z0-9.:_-]+)?/gi;

export function parseCommand(text: string): Command {
  const cleaned = text.replace(MENTION_PATTERN, " ").trim();
  const [word = "", ...rest] = cleaned.split(/\s+/).filter((t) => t.length > 0);
  switch (word.toLowerCase()) {
    case "register": {
      const url = rest[0];
      return url === undefined ? { type: "help" } : { type: "register", url };
    }
    case "search": {
      const keyword = rest.join(" ");
      return keyword.length === 0
        ? { type: "help" }
        : { type: "search", keyword };
    }
    default:
      return { type: "help" };
  }
}

export type CommandHandler = {
  /** Executes the command in `text` and returns the reply body (plain text). */
  handle(text: string): Promise<string>;
};

const HELP_TEXT = [
  "I turn RSS/Atom feeds into followable fediverse accounts. Commands:",
  "register <feed-url> — register a feed and get its account handle",
  "search <keyword> — find registered feeds",
].join("\n");

export function createCommandHandler(deps: {
  readonly registerFeed: RegisterFeed;
  readonly searchFeeds: SearchFeeds;
  /** Hostname feeds are served from, e.g. "rss2.pub" — used to render handles. */
  readonly host: string;
}): CommandHandler {
  const account = (handle: string) => `@${handle}@${deps.host}`;

  return {
    async handle(text) {
      const command = parseCommand(text);
      switch (command.type) {
        case "register": {
          const result = await deps.registerFeed.execute(command.url);
          if (!result.ok) {
            switch (result.error.type) {
              case "NotAUrl":
                return `That doesn't look like a URL: ${command.url}`;
              case "UnsupportedProtocol":
                return `Only http(s) feeds are supported (got ${result.error.protocol})`;
              case "FeedUnreachable":
                return `I couldn't read a feed there: ${result.error.message}`;
            }
          }
          const { feed, created } = result.value;
          return created
            ? `Registered ${Feed.displayName(feed)}! Follow ${account(feed.handle)} to get new posts.`
            : `Already registered — follow ${account(feed.handle)}.`;
        }
        case "search": {
          const result = await deps.searchFeeds.execute(command.keyword);
          if (!result.ok || result.value.length === 0) {
            return `No feeds found for "${command.keyword}". Register one with: register <feed-url>`;
          }
          const lines = result.value.map(
            (feed) => `${account(feed.handle)} — ${Feed.displayName(feed)}`,
          );
          return ["Found:", ...lines].join("\n");
        }
        case "help":
          return HELP_TEXT;
      }
    },
  };
}
