import { getLogger } from "@logtape/logtape";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { Hono } from "hono";
import postgres from "postgres";
import { createCommandHandler } from "../application/handle-command.js";
import { createFollowerTracker } from "../application/follower-tracker.js";
import {
  createPollDueFeeds,
  createPollFeed,
} from "../application/poll-feed.js";
import { createRegisterFeed } from "../application/register-feed.js";
import {
  createListPopularFeeds,
  createSearchFeeds,
} from "../application/search-feeds.js";
import {
  createUnregisterFeed,
  type UnregisterFeed,
} from "../application/unregister-feed.js";
import { ContentPolicy } from "../domain/content/content-policy.js";
import { PollPolicy } from "../domain/feed/poll-policy.js";
import type { Clock } from "../domain/ports/clock.js";
import { createReadabilityContentExtractor } from "../infrastructure/content/readability-extractor.js";
import { createHtmlFaviconResolver } from "../infrastructure/favicon/html-favicon-resolver.js";
import { createRssParserFetcher } from "../infrastructure/feedfetch/rss-parser-fetcher.js";
import { createBotKitFederationGateway } from "../infrastructure/federation/botkit-gateway.js";
import { createFederationStack } from "../infrastructure/federation/botkit-stack.js";
import { createDrizzleFeedRepository } from "../infrastructure/persistence/drizzle-feed-repository.js";
import { createDrizzleItemRepository } from "../infrastructure/persistence/drizzle-item-repository.js";
import {
  createPollScheduler,
  type PollScheduler,
} from "../infrastructure/scheduler/poll-scheduler.js";
import { instrumentPollFeed } from "../infrastructure/telemetry/instrumented-poll.js";
import { isErr } from "../shared/result.js";
import type { AppConfig } from "./config.js";
import { createWebRoutes } from "./routes.js";

export type App = {
  readonly fetch: (request: Request) => Response | Promise<Response>;
  readonly scheduler: PollScheduler;
  readonly unregisterFeed: UnregisterFeed;
  shutdown(): Promise<void>;
};

/**
 * Composition root: the only place where domain, application, infrastructure,
 * and BotKit are wired together. `main.ts` adds the HTTP listener and signals.
 */
export async function createApp(config: AppConfig): Promise<App> {
  const pollPolicyResult = PollPolicy.create({
    intervalSeconds: config.pollIntervalSeconds,
    maxBackoffSeconds: config.pollMaxBackoffSeconds,
  });
  if (isErr(pollPolicyResult)) {
    throw new Error(
      `invalid poll policy: ${JSON.stringify(pollPolicyResult.error)}`,
    );
  }
  const contentPolicyResult = ContentPolicy.create({
    noteMaxChars: config.noteMaxChars,
    teaserMaxChars: config.teaserMaxChars,
  });
  if (isErr(contentPolicyResult)) {
    throw new Error(
      `invalid content policy: ${JSON.stringify(contentPolicyResult.error)}`,
    );
  }

  const sql = postgres(config.databaseUrl, { onnotice: () => {} });
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: "drizzle" });

  const feeds = createDrizzleFeedRepository(db);
  const items = createDrizzleItemRepository(db);
  const fetcher = createRssParserFetcher();
  const contentExtractor = createReadabilityContentExtractor();
  const faviconResolver = createHtmlFaviconResolver();
  const clock: Clock = { now: () => new Date() };

  const registerFeed = createRegisterFeed({ feeds, fetcher, clock });
  const searchFeeds = createSearchFeeds({ feeds });
  const listPopularFeeds = createListPopularFeeds({ feeds });
  const followerTracker = createFollowerTracker({ feeds });
  const commandHandler = createCommandHandler({
    registerFeed,
    searchFeeds,
    host: config.host,
  });

  const stack = createFederationStack({
    sql,
    behindProxy: config.behindProxy,
    softwareVersion: "0.1.0",
    feeds,
    followerTracker,
    commandHandler,
    ...(config.allowPrivateAddress ? { allowPrivateAddress: true } : {}),
  });
  const federation = createBotKitFederationGateway({
    group: stack.feedBots,
    repository: stack.repository,
    origin: config.origin,
  });
  // Not awaited: the queue's listen loop resolves only when it stops.
  // Started eagerly so queued deliveries flow before any inbound request.
  stack.instance.federation.startQueue(undefined).catch((error) => {
    getLogger(["rss2pub", "main"]).error("federation queue stopped: {error}", {
      error,
    });
  });

  const pollFeed = instrumentPollFeed(
    createPollFeed({
      feeds,
      items,
      fetcher,
      federation,
      contentExtractor,
      faviconResolver,
      clock,
      pollPolicy: pollPolicyResult.value,
      contentPolicy: contentPolicyResult.value,
    }),
  );
  const pollDueFeeds = createPollDueFeeds({ feeds, pollFeed, clock });
  const scheduler = createPollScheduler({
    pollDueFeeds,
    tickIntervalMs: config.schedulerTickMs,
  });
  const unregisterFeed = createUnregisterFeed({ feeds, items, federation });

  const web = createWebRoutes({
    origin: config.origin,
    host: config.host,
    registerFeed,
    searchFeeds,
    listPopularFeeds,
    ready: async () => {
      try {
        await sql`SELECT 1`;
        return true;
      } catch {
        return false;
      }
    },
  });

  const app = new Hono();
  app.route("/", web);
  // Everything else — WebFinger, NodeInfo, /ap/*, bot profile pages — is
  // BotKit/Fedify territory.
  app.all("*", (c) => stack.instance.fetch(c.req.raw));

  return {
    fetch: (request) => app.fetch(request),
    scheduler,
    unregisterFeed,
    shutdown: async () => {
      scheduler.stop();
      await sql.end({ timeout: 5 });
    },
  };
}
