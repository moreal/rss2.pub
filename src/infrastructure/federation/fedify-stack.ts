import {
  createFederation,
  type Federation,
  type KvStore,
  type MessageQueue,
} from "@fedify/fedify";
import { Article, Create, Note } from "@fedify/vocab";
import { getLogger } from "@logtape/logtape";
import { Feed } from "../../domain/feed/feed.js";
import { Handle } from "../../domain/feed/handle.js";
import type { FeedRepository } from "../../domain/ports/feed-repository.js";
import { isErr } from "../../shared/result.js";
import { getActorKeyPairs } from "./keys.js";
import type { FederationRepository } from "./model.js";
import { renderFeedProfileHtml } from "./render.js";
import {
  buildCreate,
  buildLocalActor,
  buildMessage,
  type LocalActorDescriptor,
} from "./vocab-builders.js";

const logger = getLogger(["rss2pub", "federation"]);
const COLLECTION_PAGE_SIZE = 20;
const NODEINFO_ENUMERATION_LIMIT = 1_000_000;

export const MAIN_ACTOR_HANDLE = "rss2pub";

export type FedifyStack = {
  readonly federation: Federation<void>;
  startQueue(): void;
};

type ActorDescriptorSeed = Omit<LocalActorDescriptor, "profileUrl">;

export function createFedifyStack(deps: {
  readonly kv: KvStore;
  readonly queue?: MessageQueue;
  readonly feeds: FeedRepository;
  readonly repository: FederationRepository;
  readonly softwareVersion: string;
  readonly allowPrivateAddress?: boolean;
}): FedifyStack {
  const federation = createFederation<void>({
    kv: deps.kv,
    ...(deps.queue === undefined ? {} : { queue: deps.queue }),
    manuallyStartQueue: deps.queue !== undefined,
    userAgent: `rss2pub/${deps.softwareVersion}`,
    ...(deps.allowPrivateAddress === true ? { allowPrivateAddress: true } : {}),
  });

  async function descriptorOf(identifier: string): Promise<ActorDescriptorSeed | null> {
    if (identifier === MAIN_ACTOR_HANDLE) {
      return {
        handle: MAIN_ACTOR_HANDLE,
        name: "rss2.pub",
        summaryHtml: "I turn Atom feeds into followable accounts. Mention me with &quot;register &lt;feed-url&gt;&quot; to bridge an Atom feed, or &quot;search &lt;keyword&gt;&quot; to find one.",
        homepageUrl: null,
        iconUrl: null,
      };
    }
    const parsed = Handle.create(identifier);
    if (isErr(parsed)) return null;
    const feed = await deps.feeds.findByHandle(parsed.value);
    if (feed === null) return null;
    return {
      handle: feed.handle,
      name: Feed.displayName(feed),
      summaryHtml: renderFeedProfileHtml(feed),
      homepageUrl: new URL(feed.url),
      iconUrl: feed.iconUrl === null ? null : new URL(feed.iconUrl),
    };
  }

  const actorCallbacks = federation.setActorDispatcher(
    "/ap/actor/{identifier}",
    async (ctx, identifier) => {
      const descriptor = await descriptorOf(identifier);
      if (descriptor === null) return null;
      return buildLocalActor(
        ctx,
        {
          ...descriptor,
          profileUrl: new URL(`/@${descriptor.handle}`, ctx.origin),
        },
        await ctx.getActorKeyPairs(identifier),
      );
    },
  );
  actorCallbacks
    .mapHandle(async (_ctx, username) =>
      await descriptorOf(username) === null ? null : username)
    .setKeyPairsDispatcher(async (_ctx, identifier) =>
      await descriptorOf(identifier) === null
        ? []
        : [...await getActorKeyPairs(identifier, deps.repository)]);

  federation.setObjectDispatcher(
    Note,
    "/ap/actor/{identifier}/note/{id}",
    async (ctx, values) => {
      if (await descriptorOf(values.identifier) === null) return null;
      const record = await deps.repository.findObject(values.identifier, values.id);
      return record?.kind === "note" ? buildMessage(ctx, record) : null;
    },
  );
  federation.setObjectDispatcher(
    Article,
    "/ap/actor/{identifier}/article/{id}",
    async (ctx, values) => {
      if (await descriptorOf(values.identifier) === null) return null;
      const record = await deps.repository.findObject(values.identifier, values.id);
      return record?.kind === "article" ? buildMessage(ctx, record) : null;
    },
  );
  federation.setObjectDispatcher(
    Create,
    "/ap/actor/{identifier}/create/{id}",
    async (ctx, values) => {
      if (await descriptorOf(values.identifier) === null) return null;
      const record = await deps.repository.findObject(values.identifier, values.id);
      return record === null ? null : buildCreate(ctx, record);
    },
  );

  federation
    .setOutboxDispatcher(
      "/ap/actor/{identifier}/outbox",
      async (ctx, identifier, cursor) => {
        if (await descriptorOf(identifier) === null) return null;
        const page = await deps.repository.listObjects(
          identifier,
          cursor,
          COLLECTION_PAGE_SIZE,
        );
        return {
          items: page.items.map((record) => buildCreate(ctx, record)),
          nextCursor: page.nextCursor,
        };
      },
    )
    .setFirstCursor(async (_ctx, identifier) =>
      await descriptorOf(identifier) === null ? null : "0")
    .setCounter(async (_ctx, identifier) =>
      await descriptorOf(identifier) === null
        ? null
        : deps.repository.countObjects(identifier));

  federation
    .setFollowersDispatcher(
      "/ap/actor/{identifier}/followers",
      async (_ctx, identifier, cursor) => {
        if (await descriptorOf(identifier) === null) return null;
        const page = await deps.repository.listFollowers(
          identifier,
          cursor,
          COLLECTION_PAGE_SIZE,
        );
        return {
          items: page.items.map((follower) => ({
            id: new URL(follower.actorUri),
            inboxId: new URL(follower.inboxUri),
            endpoints: follower.sharedInboxUri === null
              ? null
              : { sharedInbox: new URL(follower.sharedInboxUri) },
          })),
          nextCursor: page.nextCursor,
        };
      },
    )
    .setFirstCursor(async (_ctx, identifier) =>
      await descriptorOf(identifier) === null ? null : "0")
    .setCounter(async (_ctx, identifier) =>
      await descriptorOf(identifier) === null
        ? null
        : deps.repository.countFollowers(identifier));

  federation.setInboxListeners(
    "/ap/actor/{identifier}/inbox",
    "/ap/inbox",
  );

  federation.setNodeInfoDispatcher("/nodeinfo/2.1", async () => {
    const feeds = await deps.feeds.listPopular(NODEINFO_ENUMERATION_LIMIT);
    let localPosts = await deps.repository.countObjects(MAIN_ACTOR_HANDLE);
    for (const { feed } of feeds) {
      localPosts += await deps.repository.countObjects(feed.handle);
    }
    const actorCount = feeds.length + 1;
    return {
      software: {
        name: "rss2pub",
        version: deps.softwareVersion,
        repository: new URL("https://github.com/moreal/rss2.pub"),
      },
      protocols: ["activitypub"],
      services: { outbound: ["atom1.0"] },
      usage: {
        users: {
          total: actorCount,
          activeMonth: actorCount,
          activeHalfyear: actorCount,
        },
        localPosts,
        localComments: 0,
      },
    };
  });

  return {
    federation,
    startQueue() {
      if (deps.queue === undefined) return;
      federation.startQueue(undefined).catch((error: unknown) => {
        logger.error("federation queue stopped: {error}", { error });
      });
    },
  };
}
