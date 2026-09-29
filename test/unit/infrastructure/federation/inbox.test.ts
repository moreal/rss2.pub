import { createFederation, MemoryKvStore } from "@fedify/fedify";
import {
  Accept,
  Create,
  Endpoints,
  Flag,
  Follow,
  Mention,
  Note,
  Person,
  PUBLIC_COLLECTION,
  Undo,
} from "@fedify/vocab";
import { describe, expect, it } from "vitest";
import { createFollowerTracker } from "../../../../src/application/follower-tracker.js";
import { createRecordAbuseReport } from "../../../../src/application/record-abuse-report.js";
import { MAIN_ACTOR_HANDLE } from "../../../../src/infrastructure/federation/identity.js";
import { createInboxHandlers } from "../../../../src/infrastructure/federation/inbox.js";
import { createInMemoryFederationRepository } from "../../../../src/infrastructure/persistence/in-memory-federation-repository.js";
import { createInMemoryFeedRepository } from "../../../../src/infrastructure/persistence/in-memory-feed-repository.js";
import { createInMemoryAbuseReportRepository } from "../../../../src/infrastructure/persistence/in-memory-abuse-report-repository.js";
import { fixedClock, makeFeed } from "../../../helpers/fakes.js";

function context() {
  const federation = createFederation<void>({ kv: new MemoryKvStore() });
  federation.setActorDispatcher("/ap/actor/{identifier}", () => null);
  federation.setObjectDispatcher(
    Note,
    "/ap/actor/{identifier}/note/{id}",
    () => null,
  );
  federation.setObjectDispatcher(
    Create,
    "/ap/actor/{identifier}/create/{id}",
    () => null,
  );
  return federation.createContext(new URL("https://local.test"), undefined);
}

it("records a Flag for a local feed sent to the main actor", async () => {
  const ctx = context();
  const feeds = createInMemoryFeedRepository();
  const feed = makeFeed({ handle: "feed_a" });
  await feeds.save(feed);
  const reports = createInMemoryAbuseReportRepository();
  const handlers = createInboxHandlers({
    feeds,
    repository: createInMemoryFederationRepository(),
    followerTracker: createFollowerTracker({ feeds }),
    recordAbuseReport: createRecordAbuseReport({ reports }),
  });
  const flag = new Flag({
    id: new URL("https://remote.test/flag/1"),
    actor: new URL("https://remote.test/actor"),
    objects: [ctx.getActorUri(feed.handle)],
    content: "Spam",
  });
  await handlers.flag(ctx, MAIN_ACTOR_HANDLE, flag);
  expect(await reports.listOpen()).toMatchObject([{
    id: "https://remote.test/flag/1",
    localHandle: feed.handle,
    comment: "Spam",
  }]);
});

it("records a Flag for an existing local Note but ignores an unknown Note", async () => {
  const ctx = context();
  const feeds = createInMemoryFeedRepository();
  const feed = makeFeed({ handle: "feed_a" });
  await feeds.save(feed);
  const repository = createInMemoryFederationRepository();
  await repository.upsertObject({
    id: "one", actorHandle: feed.handle, contentHtml: "Post",
    name: null, summaryHtml: null, sourceUrl: null, language: null,
    toUris: [], ccUris: [], attributedToUris: [], mentions: [],
    publishedAt: new Date(), updatedAt: null,
  });
  const reports = createInMemoryAbuseReportRepository();
  const handlers = createInboxHandlers({
    feeds, repository, followerTracker: createFollowerTracker({ feeds }),
    recordAbuseReport: createRecordAbuseReport({ reports }),
  });
  const reported = (id: string) => new Flag({
    id: new URL(`https://remote.test/flag/${id}`),
    actor: new URL("https://remote.test/actor"),
    objects: [ctx.getObjectUri(Note, { identifier: feed.handle, id })],
  });
  await handlers.flag(ctx, MAIN_ACTOR_HANDLE, reported("missing"));
  expect(await reports.listOpen()).toHaveLength(0);
  await handlers.flag(ctx, MAIN_ACTOR_HANDLE, reported("one"));
  expect(await reports.listOpen()).toMatchObject([{ localHandle: feed.handle }]);
});

describe("raw Fedify Follow/Undo handlers", () => {
  it("stores one follower, counts once, and sends Accept for duplicate Follow", async () => {
    const ctx = context();
    const feeds = createInMemoryFeedRepository();
    const feed = makeFeed({ handle: "feed_a" });
    await feeds.save(feed);
    const repository = createInMemoryFederationRepository();
    const accepted: { sender: string; activity: Accept }[] = [];
    const remote = new Person({
      id: new URL("https://remote.test/users/alice"),
      inbox: new URL("https://remote.test/users/alice/inbox"),
      endpoints: new Endpoints({
        sharedInbox: new URL("https://remote.test/inbox"),
      }),
    });
    const handlers = createInboxHandlers({
      feeds,
      repository,
      followerTracker: createFollowerTracker({ feeds }),
      resolveFollowActor: async () => remote,
      sendAccept: async (sender, _recipient, activity) => {
        accepted.push({ sender, activity });
      },
    });
    const follow = new Follow({
      id: new URL("https://remote.test/follows/1"),
      actor: remote.id,
      object: ctx.getActorUri(feed.handle),
    });

    await handlers.follow(ctx, feed.handle, follow);
    await handlers.follow(ctx, feed.handle, follow);

    expect(await repository.countFollowers(feed.handle)).toBe(1);
    expect(feeds.followerCountOf(feed.id)).toBe(1);
    expect(accepted).toHaveLength(2);
    expect(accepted.map(({ sender }) => sender)).toEqual([
      feed.handle,
      feed.handle,
    ]);
    expect(accepted[0]?.activity.objectId?.href).toBe(follow.id?.href);
  });

  it("removes only a matching actor's nested Follow and counts once", async () => {
    const ctx = context();
    const feeds = createInMemoryFeedRepository();
    const feed = makeFeed({ handle: "feed_a" });
    await feeds.save(feed);
    const repository = createInMemoryFederationRepository();
    const remote = new Person({
      id: new URL("https://remote.test/users/alice"),
      inbox: new URL("https://remote.test/users/alice/inbox"),
    });
    const handlers = createInboxHandlers({
      feeds,
      repository,
      followerTracker: createFollowerTracker({ feeds }),
      resolveFollowActor: async () => remote,
      sendAccept: async () => undefined,
    });
    const follow = new Follow({
      id: new URL("https://remote.test/follows/1"),
      actor: remote.id,
      object: ctx.getActorUri(feed.handle),
    });
    await handlers.follow(ctx, feed.handle, follow);

    await handlers.undo(ctx, feed.handle, new Undo({
      actor: new URL("https://remote.test/users/mallory"),
      object: follow,
    }));
    expect(await repository.countFollowers(feed.handle)).toBe(1);
    expect(feeds.followerCountOf(feed.id)).toBe(1);

    const undo = new Undo({ actor: remote.id, object: follow });
    await handlers.undo(ctx, feed.handle, undo);
    await handlers.undo(ctx, feed.handle, undo);
    expect(await repository.countFollowers(feed.handle)).toBe(0);
    expect(feeds.followerCountOf(feed.id)).toBe(0);
  });

  it("ignores unknown local targets", async () => {
    const ctx = context();
    const feeds = createInMemoryFeedRepository();
    const repository = createInMemoryFederationRepository();
    const remote = new Person({
      id: new URL("https://remote.test/users/alice"),
      inbox: new URL("https://remote.test/users/alice/inbox"),
    });
    let accepts = 0;
    const handlers = createInboxHandlers({
      feeds,
      repository,
      followerTracker: createFollowerTracker({ feeds }),
      resolveFollowActor: async () => remote,
      sendAccept: async () => {
        accepts++;
      },
    });

    await handlers.follow(ctx, "unknown", new Follow({
      actor: remote.id,
      object: ctx.getActorUri("unknown"),
    }));

    expect(await repository.countFollowers("unknown")).toBe(0);
    expect(accepts).toBe(0);
  });

  it("handles one direct command, escapes text, and stores real local mentions", async () => {
    const ctx = context();
    const feeds = createInMemoryFeedRepository();
    const feed = makeFeed({ handle: "feed_a" });
    await feeds.save(feed);
    const repository = createInMemoryFederationRepository();
    const remote = new Person({
      id: new URL("https://remote.test/users/alice"),
      inbox: new URL("https://remote.test/users/alice/inbox"),
    });
    let commandCalls = 0;
    const sent: Create[] = [];
    const handlers = createInboxHandlers({
      feeds,
      repository,
      followerTracker: createFollowerTracker({ feeds }),
      commandHandler: {
        async handle() {
          commandCalls++;
          return [
            { type: "text", value: "Registered <unsafe> " },
            { type: "mention", handle: "@feed_a@local.test" },
          ];
        },
      },
      host: "local.test",
      clock: fixedClock(new Date("2026-08-30T00:00:00Z")),
      resolveCreateActor: async () => remote,
      sendReply: async (_sender, _recipient, activity) => {
        sent.push(activity);
      },
      resolveFollowActor: async () => remote,
      sendAccept: async () => undefined,
    });
    const inbound = new Create({
      id: new URL("https://remote.test/activities/direct-1"),
      actor: remote.id,
      object: new Note({
        content: "https://source.test/feed.xml",
        tos: [ctx.getActorUri(MAIN_ACTOR_HANDLE)],
      }),
    });

    await handlers.create(ctx, MAIN_ACTOR_HANDLE, inbound);
    await handlers.create(ctx, MAIN_ACTOR_HANDLE, inbound);

    expect(commandCalls).toBe(1);
    expect(await repository.countObjects(MAIN_ACTOR_HANDLE)).toBe(1);
    const page = await repository.listObjects(MAIN_ACTOR_HANDLE, null, 20);
    expect(page.items[0]).toMatchObject({
      actorHandle: MAIN_ACTOR_HANDLE,
      contentHtml: expect.stringContaining("Registered &lt;unsafe&gt; @feed_a@local.test"),
      toUris: ["https://remote.test/users/alice"],
      ccUris: [],
      attributedToUris: ["https://local.test/ap/actor/rss2pub"],
      mentions: [{
        name: "@feed_a@local.test",
        href: "https://local.test/ap/actor/feed_a",
      }],
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.actorId?.href).toBe("https://local.test/ap/actor/rss2pub");
  });

  it("accepts a public Mention command as unlisted and ignores public text without a tag", async () => {
    const ctx = context();
    const feeds = createInMemoryFeedRepository();
    const repository = createInMemoryFederationRepository();
    const remote = new Person({
      id: new URL("https://remote.test/users/alice"),
      inbox: new URL("https://remote.test/users/alice/inbox"),
    });
    let commandCalls = 0;
    const handlers = createInboxHandlers({
      feeds,
      repository,
      followerTracker: createFollowerTracker({ feeds }),
      commandHandler: {
        async handle() {
          commandCalls++;
          return [{ type: "text", value: "Found nothing" }];
        },
      },
      host: "local.test",
      clock: fixedClock(new Date("2026-08-30T00:00:00Z")),
      resolveCreateActor: async () => remote,
      sendReply: async () => undefined,
      resolveFollowActor: async () => remote,
      sendAccept: async () => undefined,
    });
    const mentioned = new Create({
      id: new URL("https://remote.test/activities/mention-1"),
      actor: remote.id,
      object: new Note({
        content: "search rust",
        tos: [PUBLIC_COLLECTION],
        tags: [new Mention({
          name: "@rss2pub@local.test",
          href: ctx.getActorUri(MAIN_ACTOR_HANDLE),
        })],
      }),
    });
    const unmentioned = new Create({
      id: new URL("https://remote.test/activities/public-1"),
      actor: remote.id,
      object: new Note({ content: "search rust", tos: [PUBLIC_COLLECTION] }),
    });

    await handlers.create(ctx, MAIN_ACTOR_HANDLE, mentioned);
    await handlers.create(ctx, MAIN_ACTOR_HANDLE, unmentioned);

    expect(commandCalls).toBe(1);
    const page = await repository.listObjects(MAIN_ACTOR_HANDLE, null, 20);
    expect(page.items[0]).toMatchObject({
      toUris: [PUBLIC_COLLECTION.href],
      ccUris: ["https://remote.test/users/alice"],
    });
  });
});
