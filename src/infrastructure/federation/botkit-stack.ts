import {
  type Bot,
  type BotGroup,
  createInstance,
  type CreateInstanceOptions,
  type InstanceWithVoidContextData,
  link,
  mention,
  type Repository,
  text,
  type Text,
} from "@fedify/botkit";
import { PostgresRepository } from "@fedify/botkit-postgres";
import { PostgresKvStore, PostgresMessageQueue } from "@fedify/postgres";
import { getLogger } from "@logtape/logtape";
import type postgres from "postgres";
import type {
  CommandHandler,
  ReplyPart,
} from "../../application/handle-command.js";
import type { FollowerTracker } from "../../application/follower-tracker.js";
import { Feed } from "../../domain/feed/feed.js";
import { Handle } from "../../domain/feed/handle.js";
import type { FeedRepository } from "../../domain/ports/feed-repository.js";
import { isErr } from "../../shared/result.js";
import { BOTKIT_THEME_CSS } from "./pages-theme.js";
import { RawHtmlText } from "./raw-html-text.js";
import { renderFeedProfileHtml } from "./render.js";

const logger = getLogger(["rss2pub", "federation"]);

/**
 * Splits reply parts into the alternating (literal, mentioned-handle)
 * shape `text()`'s template-tag form expects: one more string segment
 * than there are mention handles, each handle sitting between the string
 * segments around it. Pulled out of {@link renderReply} so this ordering
 * logic is unit-testable without a live BotKit session.
 */
export function toTemplateParts(parts: readonly ReplyPart[]): {
  readonly strings: readonly string[];
  readonly mentionHandles: readonly string[];
} {
  const strings: string[] = [""];
  const mentionHandles: string[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      strings[strings.length - 1] += part.value;
    } else {
      mentionHandles.push(part.handle);
      strings.push("");
    }
  }
  return { strings, mentionHandles };
}

/**
 * Renders application-layer reply parts as a BotKit text tree, turning each
 * `mention` part into a real `mention()` node — this is what makes the
 * handle in a reply a clickable, followable ActivityPub `Mention` (with a
 * `tag` entry and delivery to the mentioned actor's inbox) instead of inert
 * text, per ActivityPub's mention convention.
 */
function renderReply(parts: readonly ReplyPart[]): Text<"block", void> {
  const { strings, mentionHandles } = toTemplateParts(parts);
  return text(
    Object.assign([...strings], { raw: strings }),
    ...mentionHandles.map((handle) => mention(handle)),
  );
}

/** Handle of the static main actor (PLAN.md 확정 사항). */
export const MAIN_ACTOR_HANDLE = "rss2pub";

export type FederationStack = {
  readonly instance: InstanceWithVoidContextData;
  readonly repository: Repository;
  readonly mainBot: Bot<void>;
  readonly feedBots: BotGroup<void>;
};

/**
 * Assembles the BotKit instance: one static main bot handling commands and
 * one dynamic bot group resolving feed handles from the FeedRepository, so
 * every registered feed is an actor without per-feed setup.
 */
export function createFederationStack(deps: {
  readonly sql: postgres.Sql;
  readonly behindProxy: boolean;
  readonly softwareVersion: string;
  readonly feeds: FeedRepository;
  readonly followerTracker: FollowerTracker;
  readonly commandHandler: CommandHandler;
  /** TEST ONLY: lets the document loader fetch loopback/private hosts. */
  readonly allowPrivateAddress?: boolean;
}): FederationStack {
  const repository = new PostgresRepository({ sql: deps.sql });
  const options: CreateInstanceOptions = {
    kv: new PostgresKvStore(deps.sql),
    queue: new PostgresMessageQueue(deps.sql),
    repository,
    software: {
      name: "rss2pub",
      version: deps.softwareVersion,
      homepage: new URL("https://github.com/moreal/rss2.pub"),
    },
    behindProxy: deps.behindProxy,
    // Closest built-in preset to our accent, kept for readers scanning this
    // config; BOTKIT_THEME_CSS overrides every color it actually renders
    // with, matching rss2.pub's own web UI (src/web/ui/layout.tsx).
    pages: { color: "orange", css: BOTKIT_THEME_CSS },
    ...(deps.allowPrivateAddress === true
      ? { federationOptions: { allowPrivateAddress: true } }
      : {}),
  };
  const instance = createInstance(options);

  const mainBot = instance.createBot(MAIN_ACTOR_HANDLE, {
    username: MAIN_ACTOR_HANDLE,
    name: "rss2.pub",
    summary: text`I turn RSS/Atom feeds into followable accounts. Mention me with "register <feed-url>" to bridge a feed, or "search <keyword>" to find one.`,
  });

  mainBot.onMention = async (_session, message) => {
    const reply = await deps.commandHandler.handle(message.text);
    await message.reply(renderReply(reply), {
      visibility: message.visibility === "direct" ? "direct" : "unlisted",
    });
  };

  const feedBots = instance.createBot(async (_ctx, identifier) => {
    if (identifier === MAIN_ACTOR_HANDLE) return null;
    const handle = Handle.create(identifier);
    if (isErr(handle)) return null;
    const feed = await deps.feeds.findByHandle(handle.value);
    if (feed === null) return null;
    return {
      username: feed.handle,
      name: Feed.displayName(feed),
      summary: new RawHtmlText<void>(renderFeedProfileHtml(feed)),
      properties: { Feed: link(feed.url) },
      // ADR-0010: resolved from the channel link's favicon; BotKit accepts a
      // bare URL and lets remote servers fetch it directly, so there is
      // nothing for us to download or host.
      ...(feed.iconUrl !== null ? { icon: new URL(feed.iconUrl) } : {}),
    };
  });

  feedBots.onFollow = async (session) => {
    const result = await deps.followerTracker.recordFollow(
      session.bot.identifier,
    );
    if (isErr(result)) {
      logger.warn("untracked follow for {identifier}: {error}", {
        identifier: session.bot.identifier,
        error: result.error,
      });
    }
  };

  feedBots.onUnfollow = async (session) => {
    const result = await deps.followerTracker.recordUnfollow(
      session.bot.identifier,
    );
    if (isErr(result)) {
      logger.warn("untracked unfollow for {identifier}: {error}", {
        identifier: session.bot.identifier,
        error: result.error,
      });
    }
  };

  return { instance, repository, mainBot, feedBots };
}
