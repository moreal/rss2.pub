import { Feed } from "../domain/feed/feed.js";
import type { RegisterFeed } from "./register-feed.js";

/**
 * Commands the main actor (`rss2pub`) understands in mentions/DMs.
 * `unregister` is intentionally absent (PLAN.md 확정 사항).
 */
export type Command =
  | {
      readonly type: "register";
      readonly url: string;
    }
  | { readonly type: "help" };

const MENTION_PATTERN = /(?<!\S)@[a-z0-9_]+(?:@[a-z0-9.:_-]+)?(?=\s|$)/gi;

export function parseCommand(text: string): Command {
  if (text.length > 4096) return { type: "help" };
  const cleaned = text.replace(MENTION_PATTERN, " ").trim();
  const [word = ""] = cleaned.split(/\s+/).filter((t) => t.length > 0);
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(word)
    ? { type: "register", url: word }
    : { type: "help" };
}

/**
 * A reply is a sequence of parts so federation infrastructure can render a
 * `mention` part as a real ActivityPub `Mention`
 * (clickable, followable) instead of inert text. `handle` is a fediverse handle already in `@user@host`
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
  "I turn Atom or RSS 2.0 feeds into followable fediverse accounts. Send me:",
  "@rss2pub <url> — register an Atom/RSS 2.0 feed or website and get its account handle",
].join("\n");

export function createCommandHandler(deps: {
  readonly registerFeed: RegisterFeed;
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
          const result = await deps.registerFeed.execute(command.url);
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
                    `I couldn't find an Atom or RSS 2.0 feed there: ${result.error.message}`,
                  ),
                ];
              case "MastodonFeed":
                return [t("This feed belongs to Mastodon. Follow its original account instead." + (result.error.accountUrl === undefined ? "" : "\n" + result.error.accountUrl))];
              case "MultipleFeeds":
                return [t("Several feeds are available. Mention me with the URL you want to register:\n" +
                  result.error.candidates.map(candidate => (candidate.title ?? "Feed") + " — " + candidate.url).join("\n"))];
              case "FeedBlocked":
                return [t("This feed cannot be registered.")];
              case "RegistrationUnavailable":
                return [t(result.error.retryAfterSeconds === null
                  ? "New registrations are unavailable. You can still find existing feeds at https://" + deps.host + "/search."
                  : "New registrations are currently limited. Try again in " + Math.max(1, Math.ceil(result.error.retryAfterSeconds / 60)) + " minutes.")];
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
        case "help":
          return [t(HELP_TEXT)];
      }
    },
  };
}
