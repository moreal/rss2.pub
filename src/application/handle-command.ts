import { Feed } from "../domain/feed/feed.js";
import type { RegisterFeed } from "./register-feed.js";
import type { SearchFeeds } from "./search-feeds.js";

/**
 * Commands the main actor (`rss2pub`) understands in mentions/DMs.
 * `unregister` is intentionally absent (PLAN.md 확정 사항).
 */
export type Command =
  | {
      readonly type: "register";
      readonly url: string;
      /** `register <url> full` opts into ADR-0009 full-content extraction. */
      readonly fullContentEnabled: boolean;
    }
  | { readonly type: "search"; readonly keyword: string }
  | { readonly type: "help" };

const MENTION_PATTERN = /@[a-z0-9_]+(?:@[a-z0-9.:_-]+)?/gi;

export function parseCommand(text: string): Command {
  const cleaned = text.replace(MENTION_PATTERN, " ").trim();
  const [word = "", ...rest] = cleaned.split(/\s+/).filter((t) => t.length > 0);
  switch (word.toLowerCase()) {
    case "register": {
      const url = rest[0];
      if (url === undefined) return { type: "help" };
      const fullContentEnabled = rest[1]?.toLowerCase() === "full";
      return { type: "register", url, fullContentEnabled };
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

/**
 * A reply is a sequence of parts so federation infrastructure can render a
 * `mention` part as a real ActivityPub `Mention`
 * (clickable, followable) instead of inert text — see ADR note in
 * botkit-stack.ts. `handle` is a fediverse handle already in `@user@host`
 * form (see `account` below).
 */
export type ReplyPart =
  | { readonly type: "text"; readonly value: string }
  | { readonly type: "mention"; readonly handle: string };

export type CommandHandler = {
  /** Executes the command in `text` and returns the reply as parts. */
  handle(text: string): Promise<readonly ReplyPart[]>;
};

const HELP_TEXT = [
  "I turn Atom feeds into followable fediverse accounts. Commands:",
  "register <feed-url> — register an Atom feed and get its account handle",
  "register <feed-url> full — same, but fetch each item's full article " +
    "instead of the feed's summary (a separate account from the plain one)",
  "search <keyword> — find registered feeds",
].join("\n");

export function createCommandHandler(deps: {
  readonly registerFeed: RegisterFeed;
  readonly searchFeeds: SearchFeeds;
  /** Hostname feeds are served from, e.g. "rss2.pub" — used to render handles. */
  readonly host: string;
}): CommandHandler {
  const account = (handle: string) => `@${handle}@${deps.host}`;
  const t = (value: string): ReplyPart => ({ type: "text", value });
  const m = (handle: string): ReplyPart => ({ type: "mention", handle });

  return {
    async handle(text) {
      const command = parseCommand(text);
      switch (command.type) {
        case "register": {
          const result = await deps.registerFeed.execute(
            command.url,
            command.fullContentEnabled,
          );
          if (!result.ok) {
            switch (result.error.type) {
              case "NotAUrl":
                return [t(`That doesn't look like a URL: ${command.url}`)];
              case "UnsupportedProtocol":
                return [
                  t(
                    `Only http(s) feeds are supported (got ${result.error.protocol})`,
                  ),
                ];
              case "FeedUnreachable":
                return [
                  t(
                    `I couldn't read an Atom feed there: ${result.error.message}`,
                  ),
                ];
              default: {
                const unreachable: never = result.error;
                throw new Error(
                  `Unhandled register error: ${JSON.stringify(unreachable)}`,
                );
              }
            }
          }
          const { feed, created } = result.value;
          return created
            ? [
                t(`Registered "${Feed.displayName(feed)}"!\n\nFollow `),
                m(account(feed.handle)),
                t(" to get new posts."),
              ]
            : [
                t("Already registered — follow "),
                m(account(feed.handle)),
                t("."),
              ];
        }
        case "search": {
          const result = await deps.searchFeeds.execute(command.keyword);
          if (!result.ok || result.value.length === 0) {
            return [
              t(
                `No feeds found for "${command.keyword}". Register one with: register <feed-url>`,
              ),
            ];
          }
          const parts: ReplyPart[] = [t("Found:\n")];
          for (const [index, feed] of result.value.entries()) {
            if (index > 0) parts.push(t("\n"));
            parts.push(
              m(account(feed.handle)),
              t(` — ${Feed.displayName(feed)}`),
            );
          }
          return parts;
        }
        case "help":
          return [t(HELP_TEXT)];
      }
    },
  };
}
