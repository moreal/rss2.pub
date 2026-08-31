import { PostgresKvStore, PostgresMessageQueue } from "@fedify/postgres";
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
import { createAtomFeedFetcher } from "../infrastructure/feedfetch/atom-feed-fetcher.js";
import { createFedifyGateway } from "../infrastructure/federation/fedify-gateway.js";
import { createFedifyActorResolver } from "../infrastructure/federation/fedify-actor-resolver.js";
import { createFedifyStack } from "../infrastructure/federation/fedify-stack.js";
import { createDrizzleFederationRepository } from "../infrastructure/persistence/drizzle-federation-repository.js";
import { createDrizzleFeedRepository } from "../infrastructure/persistence/drizzle-feed-repository.js";
import { createDrizzleItemRepository } from "../infrastructure/persistence/drizzle-item-repository.js";
import {
  createPollScheduler,
  type PollScheduler,
} from "../infrastructure/scheduler/poll-scheduler.js";
import { instrumentPollFeed } from "../infrastructure/telemetry/instrumented-poll.js";
import { isErr } from "../shared/result.js";
import type { AppConfig } from "./config.js";
import { createFederationPages } from "./federation-pages.js";
import { createWebRoutes } from "./routes.js";

export type App = {
  readonly fetch: (request: Request) => Response | Promise<Response>;
  readonly scheduler: PollScheduler;
  readonly unregisterFeed: UnregisterFeed;
  shutdown(): Promise<void>;
};

/**
 * Composition root: the only place where domain, application, infrastructure,
 * and raw Fedify are wired together. `main.ts` adds the HTTP listener and signals.
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
  const federationObjects = createDrizzleFederationRepository(db);
  const fetcher = createAtomFeedFetcher();
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

  const kv = new PostgresKvStore(sql);
  const queue = new PostgresMessageQueue(sql);
  const stack = createFedifyStack({
    kv,
    queue,
    origin: config.origin,
    softwareVersion: "0.1.0",
    feeds,
    repository: federationObjects,
    followerTracker,
    commandHandler,
    host: config.host,
    clock,
    ...(config.allowPrivateAddress ? { allowPrivateAddress: true } : {}),
  });
  const federation = createFedifyGateway({
    federation: stack.federation,
    repository: federationObjects,
    origin: config.origin,
    clock,
  });
  const actorResolver = createFedifyActorResolver({
    federation: stack.federation,
    origin: config.origin,
  });
  stack.startQueue();

  const pollFeed = instrumentPollFeed(
    createPollFeed({
      feeds,
      items,
      fetcher,
      federation,
      actorResolver,
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
  const federationFetch = (request: Request) => stack.federation.fetch(request, {
    contextData: undefined,
  });
  // The HTML page routes intentionally use broad one- and two-segment Hono
  // patterns so they can recognize /@handle.  Give protocol endpoints priority
  // so those patterns cannot turn WebFinger or NodeInfo requests into 404s.
  app.all("/.well-known/*", (c) => federationFetch(c.req.raw));
  app.all("/nodeinfo/*", (c) => federationFetch(c.req.raw));
  app.all("/ap/*", (c) => federationFetch(c.req.raw));
  app.route(
    "/",
    createFederationPages({
      origin: config.origin,
      feeds,
      federationObjects,
    }),
  );
  app.all("*", (c) => federationFetch(c.req.raw));

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
