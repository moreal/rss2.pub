# M7 Raw Fedify Parity Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace BotKit with first-party raw Fedify dispatchers, persistence, delivery, inbox behavior, and HTML pages without changing rss2.pub's public actor behavior.

**Architecture:** Fedify owns protocol routing, signatures, SSRF protection, KV, and queued delivery; focused first-party adapters own actor resolution, persisted keys/followers/objects, vocab construction, inbox semantics, and Hono HTML pages. Domain/application code continues through `FederationGateway`, `FeedRepository`, `FollowerTracker`, and `CommandHandler` ports/use cases.

**Tech Stack:** Node.js 24, TypeScript NodeNext, Fedify/Vocab 2.3.5 line, @fedify/postgres, PostgreSQL 17+, Drizzle ORM, Hono JSX, Vitest/Testcontainers

**Spec:** `docs/design/2026-08-30-atom-fedify-attribution-design.md`

## Global Constraints

- Start from a completed, green M6 branch; all feed-source fixtures are Atom and `@rss2pub/atom-feed` is already packaged.
- Preserve `/ap/actor/{handle}`, inbox/outbox/followers, note/article/create, shared inbox, `/@{handle}`, and `/@{handle}/{id}` URI shapes.
- Preserve signed Follow-to-Accept, public Create/Update/Delete fan-out, main actor register/search via mention or DM, and direct/unlisted reply visibility.
- Do not migrate or read historical BotKit repository data.
- Persist two key pairs per local actor: RSA-PKCS1-v1.5 and Ed25519.
- Use stable object IDs derived from `(FeedId, ItemKey)`; retries reuse the same object and Create IDs.
- An object's initial Note/Article kind and URI remain immutable across Update.
- Use `PostgresKvStore` and `PostgresMessageQueue`; never await the long-lived `startQueue()` call.
- `allowPrivateAddress: true` remains test-only.
- Domain imports remain inward-only; no Fedify/Vocab/Drizzle types cross a domain port.
- No `any`, casts used to silence type errors, non-null assertions, or relative ESM imports without
  `.js`. Owning branded constructors and Drizzle's `$type<T>()` schema declaration remain allowed.
- Every commit in this plan contains exactly one `Assisted-by: Codex:gpt-5.6-sol` trailer.
- The milestone is complete only when `yarn typecheck && yarn test && nix build .#` passes.

## File Structure

### Create

- `src/infrastructure/federation/model.ts` — stored key/follower/object records and repository interfaces.
- `src/infrastructure/federation/identity.ts` — stable object IDs and canonical Fedify URI helpers.
- `src/infrastructure/federation/keys.ts` — JWK import/export and race-safe lazy key generation.
- `src/infrastructure/federation/vocab-builders.ts` — local actors, Note/Article, Create/Update/Delete builders.
- `src/infrastructure/federation/fedify-stack.ts` — federation construction and dispatcher registration.
- `src/infrastructure/federation/inbox.ts` — Follow/Undo and main-command listeners.
- `src/infrastructure/federation/fedify-gateway.ts` — raw Fedify `FederationGateway` adapter.
- `src/infrastructure/persistence/in-memory-federation-repository.ts` — protocol adapter unit-test repository.
- `src/infrastructure/persistence/drizzle-federation-repository.ts` — PostgreSQL implementation.
- `src/web/federation-pages.tsx` — actor and message HTML routes.
- `test/unit/infrastructure/federation/identity.test.ts`
- `test/unit/infrastructure/federation/keys.test.ts`
- `test/unit/infrastructure/federation/vocab-builders.test.ts`
- `test/unit/infrastructure/federation/fedify-gateway.test.ts`
- `test/unit/infrastructure/federation/inbox.test.ts`
- `test/unit/infrastructure/federation/fedify-stack.test.ts`
- `test/unit/infrastructure/persistence/in-memory-federation-repository.test.ts`
- `test/unit/web/federation-pages.test.ts`
- New generated Drizzle migration and snapshot files.

### Modify

- `src/domain/ports/federation-gateway.ts` — publish accepts `ItemKey` for stable identity.
- `src/application/poll-feed.ts` and gateway fakes/tests — pass item keys.
- `src/infrastructure/persistence/schema.ts` — three federation tables.
- `src/web/app.ts` — compose repositories, raw federation, gateway, pages, and queue.
- `test/e2e/federation.test.ts`, `test/e2e/remote-federation.test.ts`, `test/e2e/persistence.test.ts` — parity/restart assertions.
- `package.json`, `yarn.lock`, `nix/missing-hashes.json`, `flake.nix`, `Containerfile` — remove BotKit packages and refresh offline graph.
- `README.md`, `AGENTS.md`, `docs/PLAN.md` — mark M7 implemented and remove live BotKit guidance.

### Delete

- `src/infrastructure/federation/botkit-stack.ts`
- `src/infrastructure/federation/botkit-gateway.ts`
- `src/infrastructure/federation/raw-html-text.ts`
- `test/unit/infrastructure/federation/botkit-stack.test.ts`

Keep `render.ts` and `pages-theme.ts`; they become first-party rendering assets.

---

### Task 1: Define and test the protocol persistence model

**Files:**
- Create: `src/infrastructure/federation/model.ts`
- Create: `src/infrastructure/persistence/in-memory-federation-repository.ts`
- Test: `test/unit/infrastructure/persistence/in-memory-federation-repository.test.ts`

**Interfaces:**
- Produces: `FederationRepository` with key, follower, and object operations.
- Produces: `StoredFederationObject`, `StoredFollower`, `StoredKeyPair`, and `StoredMention`.
- Pagination uses `{ items, nextCursor }` with opaque decimal offset cursors and page size supplied by the caller.

- [ ] **Step 1: Write repository behavior tests**

```ts
it("adds and removes a follower idempotently", async () => {
  const repo = createInMemoryFederationRepository();
  const follower = {
    localHandle: "feed_a",
    actorUri: "https://remote.test/users/alice",
    inboxUri: "https://remote.test/users/alice/inbox",
    sharedInboxUri: "https://remote.test/inbox",
    followedAt: new Date("2026-08-30T00:00:00Z"),
  };
  expect(await repo.addFollower(follower)).toBe(true);
  expect(await repo.addFollower(follower)).toBe(false);
  expect(await repo.removeFollower(follower.localHandle, follower.actorUri)).toBe(true);
  expect(await repo.removeFollower(follower.localHandle, follower.actorUri)).toBe(false);
});

it("upserts one stable object and pages newest first", async () => {
  const repo = createInMemoryFederationRepository();
  await repo.upsertObject(objectRecord("a", "2026-08-30T00:00:00Z"));
  await repo.upsertObject(objectRecord("b", "2026-08-31T00:00:00Z"));
  await repo.upsertObject({ ...objectRecord("a", "2026-08-30T00:00:00Z"), contentHtml: "changed" });
  expect(await repo.findObject("feed_a", "a")).toMatchObject({ contentHtml: "changed" });
  expect((await repo.listObjects("feed_a", null, 1)).items.map((item) => item.id)).toEqual(["b"]);
});
```

Also test key-pair insert-if-absent and follower/object count/list cursor behavior.

- [ ] **Step 2: Run the repository test and verify missing imports**

Run: `yarn test:unit test/unit/infrastructure/persistence/in-memory-federation-repository.test.ts`

Expected: FAIL because model and repository files do not exist.

- [ ] **Step 3: Define the complete stored record types**

```ts
export type StoredKeyAlgorithm = "RSASSA-PKCS1-v1_5" | "Ed25519";
export type StoredKeyPair = {
  readonly localHandle: string;
  readonly algorithm: StoredKeyAlgorithm;
  readonly publicJwk: JsonWebKey;
  readonly privateJwk: JsonWebKey;
  readonly createdAt: Date;
};

export type StoredFollower = {
  readonly localHandle: string;
  readonly actorUri: string;
  readonly inboxUri: string;
  readonly sharedInboxUri: string | null;
  readonly followedAt: Date;
};

export type StoredMention = { readonly name: string; readonly href: string };
export type StoredFederationObject = {
  readonly id: string;
  readonly actorHandle: string;
  readonly kind: "note" | "article";
  readonly contentHtml: string;
  readonly name: string | null;
  readonly summaryHtml: string | null;
  readonly sourceUrl: string | null;
  readonly language: string | null;
  readonly toUris: readonly string[];
  readonly ccUris: readonly string[];
  readonly attributedToUris: readonly string[];
  readonly mentions: readonly StoredMention[];
  readonly publishedAt: Date;
  readonly updatedAt: Date | null;
};
```

`FederationRepository` methods are `getKeyPairs`, `saveKeyPairsIfAbsent`, `addFollower`,
`removeFollower`, `countFollowers`, `listFollowers`, `upsertObject`, `findObject`, `countObjects`,
`listObjects`, and `removeObjectsOfActor`. All return Promises and readonly records.

- [ ] **Step 4: Implement the in-memory repository with copied records**

Use nested Maps keyed by local handle and composite follower/object keys. Return new arrays and copied
records so tests cannot mutate repository state. Parse cursors only with `/^\d+$/`; invalid cursors
start at offset zero.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `yarn test:unit test/unit/infrastructure/persistence/in-memory-federation-repository.test.ts && yarn typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the persistence contracts**

```bash
git add src/infrastructure/federation/model.ts src/infrastructure/persistence/in-memory-federation-repository.ts test/unit/infrastructure/persistence
git commit -m "feat(federation): define persisted protocol state" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 2: Add Drizzle federation tables and repository

**Files:**
- Modify: `src/infrastructure/persistence/schema.ts`
- Create: `src/infrastructure/persistence/drizzle-federation-repository.ts`
- Create: generated `drizzle/0005_*.sql`
- Modify: `drizzle/meta/_journal.json`
- Create: generated `drizzle/meta/0005_snapshot.json`
- Modify: `test/e2e/persistence.test.ts`

**Interfaces:**
- Consumes: `FederationRepository` from Task 1.
- Produces: `createDrizzleFederationRepository(db): FederationRepository`.

- [ ] **Step 1: Add persistence E2E assertions before schema implementation**

Add a test that saves both algorithms, performs duplicate Follow/Undo, upserts one object, recreates
the repository over the same database, and reads identical JWK/follower/object values. Assert
`saveKeyPairsIfAbsent` returns `true` once and `false` on the second call.

- [ ] **Step 2: Run the persistence test and verify missing tables**

Run: `yarn test:e2e test/e2e/persistence.test.ts`

Expected: FAIL because `createDrizzleFederationRepository` and tables do not exist.

- [ ] **Step 3: Define the three tables**

Use:

```ts
export const federationActorKeys = pgTable("federation_actor_keys", {
  localHandle: text("local_handle").notNull(),
  algorithm: text("algorithm").notNull(),
  publicJwk: jsonb("public_jwk").$type<JsonWebKey>().notNull(),
  privateJwk: jsonb("private_jwk").$type<JsonWebKey>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => [primaryKey({ columns: [table.localHandle, table.algorithm] })]);
```

Define `federation_followers` with primary key `(local_handle, actor_uri)` and an index on
`local_handle`. Define `federation_objects` with primary key `(actor_handle, id)`, text-array columns
`to_uris`, `cc_uris`, and `attributed_to_uris`, a typed JSONB `mentions` column, timestamps, and a
descending actor/published index. M8 extends the values stored in `attributed_to_uris`; it does not
add another table or migration.

- [ ] **Step 4: Generate and inspect the migration**

Run: `yarn drizzle-kit generate`

Expected: one migration creates exactly the three tables and their indexes; it does not alter domain
tables. Read the SQL before proceeding.

- [ ] **Step 5: Implement repository methods with conflict-aware booleans**

Use `insert(...).onConflictDoNothing().returning(...)`; return `rows.length === 1` for key/follower
inserts. Use `delete(...).returning(...)` for follower removal. Keep cursor parsing and ordering
identical to the in-memory implementation.

- [ ] **Step 6: Run repository unit/E2E tests**

Run: `yarn test:unit test/unit/infrastructure/persistence/in-memory-federation-repository.test.ts && yarn test:e2e test/e2e/persistence.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit database persistence**

```bash
git add src/infrastructure/persistence drizzle test/e2e/persistence.test.ts
git commit -m "feat(federation): persist keys followers and objects" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 3: Implement stable identities and actor key persistence

**Files:**
- Create: `src/infrastructure/federation/identity.ts`
- Create: `src/infrastructure/federation/keys.ts`
- Test: `test/unit/infrastructure/federation/identity.test.ts`
- Test: `test/unit/infrastructure/federation/keys.test.ts`

**Interfaces:**
- Produces: `stableObjectId(feedId: FeedId, itemKey: ItemKey): string`.
- Produces: `getActorKeyPairs(handle, repository): Promise<readonly CryptoKeyPair[]>`.

- [ ] **Step 1: Write deterministic identity and concurrent key tests**

```ts
it("derives stable, disjoint object IDs", () => {
  expect(stableObjectId(feedA, itemOne)).toBe(stableObjectId(feedA, itemOne));
  expect(stableObjectId(feedA, itemOne)).not.toBe(stableObjectId(feedA, itemTwo));
  expect(stableObjectId(feedA, itemOne)).toMatch(/^[0-9a-f]{64}$/);
});

it("creates RSA and Ed25519 once under concurrent calls", async () => {
  const repo = createInMemoryFederationRepository();
  const [a, b] = await Promise.all([
    getActorKeyPairs("feed_a", repo),
    getActorKeyPairs("feed_a", repo),
  ]);
  expect(a).toHaveLength(2);
  expect(b).toHaveLength(2);
  expect(await repo.getKeyPairs("feed_a")).toHaveLength(2);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `yarn test:unit test/unit/infrastructure/federation/identity.test.ts test/unit/infrastructure/federation/keys.test.ts`

Expected: FAIL with missing functions.

- [ ] **Step 3: Implement stable object identity**

Return `sha256Hex(`${feedId}\u0000${itemKey}`)` using the shared pure hashing wrapper. Keep URI path
construction in dispatcher context helpers; do not concatenate origins in domain code.

- [ ] **Step 4: Implement race-safe key creation**

If stored rows exist, `importJwk(public, "public")` and `importJwk(private, "private")`. Otherwise
generate RSA and Ed25519 via `generateCryptoKeyPair`, export both halves, call
`saveKeyPairsIfAbsent`, then reload the winning rows. Memoize only in-flight promises per handle and
delete a rejected promise from the map.

- [ ] **Step 5: Run tests and verify JWK round-trip signing algorithms**

Run: `yarn test:unit test/unit/infrastructure/federation/identity.test.ts test/unit/infrastructure/federation/keys.test.ts`

Expected: PASS; both returned private keys have usage `sign` and public keys have usage `verify`.

- [ ] **Step 6: Commit identity and keys**

```bash
git add src/infrastructure/federation/identity.ts src/infrastructure/federation/keys.ts test/unit/infrastructure/federation
git commit -m "feat(federation): persist stable actor identities" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 4: Build actors, messages, and activities from stored records

**Files:**
- Create: `src/infrastructure/federation/vocab-builders.ts`
- Test: `test/unit/infrastructure/federation/vocab-builders.test.ts`

**Interfaces:**
- Produces: `buildLocalActor(ctx, descriptor, keyPairs): Service`.
- Produces: `buildMessage(ctx, record): Note | Article`.
- Produces: `buildCreate(ctx, record): Create` and `buildUpdate(ctx, record, activityId): Update`.
- `LocalActorDescriptor` covers static main actor and dynamic feed actors without importing BotKit.

- [ ] **Step 1: Write serialized JSON-LD tests**

Assert a feed actor contains canonical actor/inbox/outbox/followers/shared-inbox URIs, profile URL,
feed homepage attachment, optional icon, RSA public key, and both assertion methods. Assert a public
Note contains source `url`, language-tagged content, `to` Public, `cc` followers, and exactly one
`attributedTo`: its local actor. Assert an Article has `name`, `summary`, and content. Assert Create
wraps the same object ID and audiences.

- [ ] **Step 2: Run the builder test and verify failure**

Run: `yarn test:unit test/unit/infrastructure/federation/vocab-builders.test.ts`

Expected: FAIL because builders do not exist.

- [ ] **Step 3: Implement local actor descriptors and builders**

Use `Service`, `Endpoints`, `PropertyValue`, and `Image` from `@fedify/vocab`. The main actor descriptor
uses handle `rss2pub`, name `rss2.pub`, and the Atom-only command summary. Feed descriptors use
`Feed.displayName`, `renderFeedProfileHtml`, feed source URL property, and optional favicon.

- [ ] **Step 4: Implement stored object and activity builders**

Map optional stored strings through a local `urlOf(raw): URL | null` helper that catches invalid URLs;
omit an invalid optional source/mention/remote recipient instead of throwing. Required local actor and
object URLs come from Fedify context helpers. Build `Mention` tags only from stored mentions. Use
`LanguageString` for content/name/summary when language is present. For a stored kind, always return
that class even if fields resemble the other kind.

- [ ] **Step 5: Run builder tests**

Run: `yarn test:unit test/unit/infrastructure/federation/vocab-builders.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit vocab construction**

```bash
git add src/infrastructure/federation/vocab-builders.ts test/unit/infrastructure/federation/vocab-builders.test.ts
git commit -m "feat(federation): build ActivityPub objects directly" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 5: Register actor, object, outbox, followers, WebFinger, and NodeInfo dispatchers

**Files:**
- Create: `src/infrastructure/federation/fedify-stack.ts`
- Test: `test/unit/infrastructure/federation/fedify-stack.test.ts`

**Interfaces:**
- Produces: `createFedifyStack(deps): { federation, startQueue(): void }`.
- Consumes: feed and federation repositories, key loader, vocab builders, KV, queue.
- Uses collection page size 20.

- [ ] **Step 1: Write fetch-level dispatcher tests**

Using `MemoryKvStore` and the in-memory federation repository, assert:

- WebFinger resolves `rss2pub` and a stored feed handle and 404s unknown handles.
- `/ap/actor/{handle}` returns a `Service` and unknown handles return 404.
- Note/article paths refuse a row of the wrong kind.
- Create dereferences to the stored object.
- outbox and followers counters/pages are newest-first and paginated at 20.
- NodeInfo software name is `rss2pub`, protocol is `activitypub`, and local user/post counts come
  from repositories.

- [ ] **Step 2: Run dispatcher tests and verify failure**

Run: `yarn test:unit test/unit/infrastructure/federation/fedify-stack.test.ts`

Expected: FAIL because the stack does not exist.

- [ ] **Step 3: Create the federation and actor dispatcher**

Call `createFederation<void>({ kv, queue, allowPrivateAddress, userAgent })`. Register
`setActorDispatcher("/ap/actor/{identifier}", ...)`, chain `.mapHandle(...)`, and
`.setKeyPairsDispatcher(...)`. Resolve `rss2pub` statically; all other identifiers pass through
`Handle.create` and `FeedRepository.findByHandle`.

- [ ] **Step 4: Register object and collection dispatchers**

Register Note and Article on their BotKit-compatible paths, Create on its path, outbox/followers with
`setFirstCursor` and `setCounter`, and NodeInfo `/nodeinfo/2.1`. Return `null` whenever actor ownership
or stored kind does not match route values.

- [ ] **Step 5: Implement queue start without awaiting it**

`startQueue()` calls
`federation.startQueue(undefined).catch(error => logger.error("federation queue stopped: {error}",
{ error }))` and returns `void`.
Expose no Promise that application composition could accidentally await.

- [ ] **Step 6: Run dispatcher tests**

Run: `yarn test:unit test/unit/infrastructure/federation/fedify-stack.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the read-side federation stack**

```bash
git add src/infrastructure/federation/fedify-stack.ts test/unit/infrastructure/federation/fedify-stack.test.ts
git commit -m "feat(federation): serve actors objects and collections" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 6: Replace the BotKit gateway with stable raw Fedify delivery

**Files:**
- Modify: `src/domain/ports/federation-gateway.ts`
- Modify: `src/application/poll-feed.ts`
- Create: `src/infrastructure/federation/fedify-gateway.ts`
- Modify: `test/helpers/fakes.ts`
- Modify: `test/unit/application/poll-feed.test.ts`
- Modify: `test/unit/application/unregister-feed.test.ts`
- Test: `test/unit/infrastructure/federation/fedify-gateway.test.ts`
- Modify: `test/e2e/federation.test.ts`

**Interfaces:**
- Changes: `publish(feed, itemKey, content): Promise<Result<PublishedMessage, FederationError>>`.
- Produces: `createFedifyGateway({ federation, repository, origin, clock, sendActivity? }): FederationGateway`.
- Test seam: `sendActivity` has signature
  `(senderHandle: string, recipients: "followers", activity: Activity) => Promise<void>`; production
  omits it and uses the federation context with `preferSharedInbox: true`.

- [ ] **Step 1: Update fake signatures and write stable retry tests**

In the poll test, make the first gateway call return `FederationDeliveryFailed`, rerun the same poll,
and assert both calls receive the same `ItemKey`. In the gateway unit test, use an in-memory
repository and an injected `sendActivity` spy; assert repeated publish of the same key leaves one
object row, invokes the spy with the same Create ID, and returns the same message URI.

- [ ] **Step 2: Run focused tests and verify compile failure**

Run: `yarn test:unit test/unit/application/poll-feed.test.ts test/unit/application/unregister-feed.test.ts`

Expected: FAIL until every gateway implementation/fake accepts `ItemKey`.

- [ ] **Step 3: Pass item keys through the domain port**

Change only the publish call:

```ts
const result = await deps.federation.publish(feed, item.key, content);
```

Update JSDoc to state that the key provides retry-stable object identity. Update fakes without casts.

- [ ] **Step 4: Implement publish and Update**

For publish, derive the stable ID, build the initial stored kind/content, set `to=[Public]`,
`cc=[followers]`, `attributedTo=[local actor]`, upsert, then call
`ctx.sendActivity({ identifier: feed.handle }, "followers", create, { preferSharedInbox: true })`.
For Update, parse the message URI through `federation.parseUri`, load the existing row, preserve its
kind, replace content fields, set `updatedAt`, upsert, and send an Update whose activity ID contains a
fresh `crypto.randomUUID()` to followers. Project content into the immutable stored kind exactly:

- stored Note: `contentHtml` uses `renderNoteHtml` or `renderArticleHtml` according to new content;
  `name` and `summaryHtml` remain null;
- stored Article: `contentHtml` uses the corresponding renderer; Article input supplies its name and
  rendered summary, while Note input supplies `title` as nullable name and null summary;
- both kinds replace source URL and language from the new content.

- [ ] **Step 5: Implement actor Delete**

Build the same public Delete/Tombstone semantics as the old adapter and fan out before the feed row is
removed. After queueing, remove the actor's stored objects and followers but retain key rows for queued
signature work.

- [ ] **Step 6: Run unit and signed delivery E2E**

Run: `yarn test:unit test/unit/application/poll-feed.test.ts test/unit/application/unregister-feed.test.ts`

Run: `yarn test:unit test/unit/infrastructure/federation/fedify-gateway.test.ts && yarn test:e2e test/e2e/federation.test.ts`

Expected: raw publish/update/delete and local object dereferencing PASS. Signed Follow delivery remains
covered by the unchanged remote E2E when Task 7 registers inbox listeners; no test is skipped.

- [ ] **Step 7: Commit raw outbound delivery**

```bash
git add src/domain/ports/federation-gateway.ts src/application/poll-feed.ts src/infrastructure/federation/fedify-gateway.ts test
git commit -m "feat(federation): publish through raw Fedify" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 7: Implement signed Follow and Undo handling

**Files:**
- Create: `src/infrastructure/federation/inbox.ts`
- Modify: `src/infrastructure/federation/fedify-stack.ts`
- Test: `test/unit/infrastructure/federation/inbox.test.ts`
- Modify: `test/e2e/remote-federation.test.ts`

**Interfaces:**
- Produces: `registerInboxListeners(federation, deps): void`.
- Uses Fedify `withIdempotency("per-inbox")` plus repository idempotence.

- [ ] **Step 1: Write Follow/Undo unit scenarios**

Assert an unknown target is ignored, a valid first Follow stores the actor and calls
`recordFollow(handle)` once, duplicate Follow changes neither count nor row, and Undo only removes when
the Undo actor equals the nested Follow actor. Assert Accept uses the followed local actor as signer
and the resolved remote actor as recipient.

- [ ] **Step 2: Run inbox unit tests and verify failure**

Run: `yarn test:unit test/unit/infrastructure/federation/inbox.test.ts`

Expected: FAIL because listeners do not exist.

- [ ] **Step 3: Register listeners and validation**

Use `setInboxListeners("/ap/actor/{identifier}/inbox", "/ap/inbox")`, register `Follow` and `Undo`,
then set the shared-inbox authenticated loader identity with
`.setSharedKeyDispatcher(() => ({ identifier: MAIN_ACTOR_HANDLE }))` and call
`.withIdempotency("per-inbox")`. Require Follow `objectId` to equal the addressed local actor URI.
Resolve the actor through `follow.getActor(ctx)` and require non-null actor ID/inbox before storing.

- [ ] **Step 4: Send Accept and update counts only on row changes**

After a successful first insert, call the follower tracker only for feed actors; main actor followers
are stored but have no feed count. Send `Accept({ actor: localActor, object: follow })` explicitly to
the resolved follower. For Undo, compare identities and decrement only after repository deletion
returns true.

- [ ] **Step 5: Run signed remote federation tests**

Run: `yarn test:e2e test/e2e/remote-federation.test.ts`

Expected: signed Follow-to-Accept, one visible follower, Create, Update, and Delete all PASS.

- [ ] **Step 6: Commit inbox follow semantics**

```bash
git add src/infrastructure/federation/inbox.ts src/infrastructure/federation/fedify-stack.ts test/unit/infrastructure/federation/inbox.test.ts test/e2e/remote-federation.test.ts
git commit -m "feat(federation): accept follows with raw Fedify" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 8: Implement main actor mention/DM commands and replies

**Files:**
- Modify: `src/infrastructure/federation/inbox.ts`
- Modify: `src/infrastructure/federation/vocab-builders.ts`
- Modify: `src/application/handle-command.ts`
- Modify: `test/unit/infrastructure/federation/inbox.test.ts`
- Modify: `test/unit/application/handle-command.test.ts`
- Modify: `test/e2e/remote-federation.test.ts`

**Interfaces:**
- Consumes: existing `CommandHandler.handle(text): Promise<readonly ReplyPart[]>`.
- Produces: stored main-actor Note and signed Create reply.
- Direct input: `to=[sender]`, `cc=[]`; non-direct mention: `to=[Public]`, `cc=[sender]`.

- [ ] **Step 1: Add command eligibility and visibility tests**

Cover direct audience without a Mention tag, public/unlisted message with a Mention tag, public text
without a Mention, message addressed to a feed actor, wrong object type, and duplicate Create ID.
Assert only the first two main-actor cases call the handler. Assert each `ReplyPart` mention becomes a
stored `Mention` with the local feed actor URI and leaves literal text HTML-escaped. Add an application
test requiring search results to return alternating text/`mention` parts rather than embedding
`@handle@host` inside one text part.

- [ ] **Step 2: Run focused inbox tests and verify failure**

Run: `yarn test:unit test/unit/infrastructure/federation/inbox.test.ts -t "command"`

Expected: FAIL because Create is not registered.

- [ ] **Step 3: Parse eligible Create(Note/Article) safely**

Register `Create`. Require recipient identifier `rss2pub`, non-null activity ID and sender actor, then
obtain the object with `create.getObject(ctx)`. Eligibility is either main actor URI in `to`/`cc` with
no Public audience (DM), or a `Mention.href` equal to main actor URI. Convert HTML content to plain
command text using the existing domain `stripHtml`; do not evaluate HTML or accept attachments.

- [ ] **Step 4: Render and store the reply**

Change the search branch in `handle-command.ts` to construct `ReplyPart[]` with `mention` entries for
each result and text separators/display names. Convert `ReplyPart[]` to sanitized HTML plus
`StoredMention[]`. Parse only handles in exact `@local_handle@configured-host` form, then resolve the
local handle through FeedRepository; unresolved or foreign-host handles remain escaped literal text.
Derive reply ID from
`sha256Hex("reply\u0000" + inboundActivityId)`, upsert the Note, and send a Create explicitly to the
sender Recipient. Do not include the sender in body text unless returned by `CommandHandler`.

- [ ] **Step 5: Add signed command E2E and run it**

Have the remote Fedify actor send one direct `register <fixture-atom-url>` and one public Mention
`search <keyword>`. Assert direct/unlisted audiences, reply attribution to `rss2pub`, real Mention tags
for returned feed handles, and no second reply when the same Create ID is resent.

Run: `yarn test:e2e test/e2e/remote-federation.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit main actor commands**

```bash
git add src/application/handle-command.ts src/infrastructure/federation/inbox.ts src/infrastructure/federation/vocab-builders.ts test/unit/application/handle-command.test.ts test/unit/infrastructure/federation/inbox.test.ts test/e2e/remote-federation.test.ts
git commit -m "feat(federation): handle main actor commands" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 9: Replace BotKit HTML pages and wire the composition root

**Files:**
- Create: `src/web/federation-pages.tsx`
- Create: `test/unit/web/federation-pages.test.ts`
- Modify: `src/web/app.ts`
- Modify: `test/e2e/federation.test.ts`
- Modify: `test/e2e/actor-icon.test.ts`

**Interfaces:**
- Produces: `createFederationPages({ origin, feeds, federationObjects }): Hono`.
- Profile route `/@{handle}` and message route `/@{handle}/{id}` negotiate HTML only; ActivityPub JSON remains under `/ap/*`.

- [ ] **Step 1: Write page route tests**

Assert main/feed actor profiles show display name, full handle, sanitized summary, source feed link,
optional icon, follower count, and newest public posts. Assert message pages render Note/Article
metadata and source link, unknown handle/object 404s, and hostile stored HTML is sanitized. Reuse
`BOTKIT_THEME_CSS` initially to keep visual parity.

- [ ] **Step 2: Run page tests and verify failure**

Run: `yarn test:unit test/unit/web/federation-pages.test.ts`

Expected: FAIL because page routes do not exist.

- [ ] **Step 3: Implement focused first-party pages**

Keep CSS in `pages-theme.ts`; do not introduce product UI token literals into `src/web/ui/styles.ts`.
Use existing `renderFeedProfileHtml` and sanitized stored message HTML. Route `/@{handle}` before
`/@{handle}/{id}` and reserve `followers` as a 404 rather than treating it as an object ID.

- [ ] **Step 4: Rewire `createApp`**

Construct Drizzle domain/federation repositories, one `PostgresKvStore`, one
`PostgresMessageQueue`, raw stack, gateway, and pages. Call `stack.startQueue()` eagerly. Route order:
product web routes, federation HTML pages, then `app.all("*", c => federation.fetch(c.req.raw,
{ contextData: undefined }))`. Preserve scheduler/unregister/shutdown APIs.

- [ ] **Step 5: Run web and federation E2E**

Run: `yarn test:unit test/unit/web/federation-pages.test.ts test/unit/web/routes.test.ts`

Run: `yarn test:e2e test/e2e/federation.test.ts test/e2e/actor-icon.test.ts test/e2e/remote-federation.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit first-party pages and wiring**

```bash
git add src/web src/infrastructure/federation test/unit/web test/e2e
git commit -m "feat(web): serve federation pages without BotKit" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 10: Remove BotKit and prove restart parity

**Files:**
- Delete: `src/infrastructure/federation/botkit-stack.ts`
- Delete: `src/infrastructure/federation/botkit-gateway.ts`
- Delete: `src/infrastructure/federation/raw-html-text.ts`
- Delete: `test/unit/infrastructure/federation/botkit-stack.test.ts`
- Modify: `package.json`, `yarn.lock`, `.yarnrc.yml`
- Modify: `nix/missing-hashes.json`, `flake.nix`, `Containerfile`
- Modify: `README.md`, `AGENTS.md`, `docs/PLAN.md`
- Modify: `test/e2e/persistence.test.ts`

**Interfaces:**
- Removes all runtime imports and package entries for `@fedify/botkit` and `@fedify/botkit-postgres`.

- [ ] **Step 1: Add restart acceptance coverage**

Boot an app, fetch and retain its actor RSA public key, publish a post and follow it, shut the app
down, boot a second app against the same database/origin, and assert the same public key, object,
outbox count, follower collection, and HTML message page are returned.

- [ ] **Step 2: Run restart E2E before deleting BotKit**

Run: `yarn test:e2e test/e2e/persistence.test.ts`

Expected: PASS on the raw stack.

- [ ] **Step 3: Delete BotKit code and dependencies**

Run: `yarn remove @fedify/botkit @fedify/botkit-postgres`

Delete the three adapter files and old unit test. Remove BotKit minimal-age exceptions and patch-copy
steps only when no other `.yarn/patches` file remains. Keep Fedify/Vocab pinned to the already tested
2.3.5-compatible line.

- [ ] **Step 4: Update live documentation**

Replace BotKit runtime/gotcha sections in README/AGENTS with exact raw Fedify dispatcher paths,
first-party tables, key requirements, queue non-await rule, and M7 test commands. Mark M7 complete in
`docs/PLAN.md`; leave ADR-0001/0007 as superseded history.

- [ ] **Step 5: Refresh Nix hashes**

Run:

```bash
nix run nixpkgs#yarn-berry_4-fetcher.yarn-berry-fetcher -- missing-hashes yarn.lock > nix/missing-hashes.json
nix run nixpkgs#yarn-berry_4-fetcher.yarn-berry-fetcher -- prefetch yarn.lock nix/missing-hashes.json
```

Put the reported hash in `flake.nix`.

- [ ] **Step 6: Run searches and complete quality gates**

Run: `rg -n "@fedify/botkit|botkit-stack|botkit-gateway|RawHtmlText" src test package.json .yarnrc.yml`

Expected: no matches.

Run: `yarn install --immutable && yarn typecheck && yarn test && yarn build && nix build .#`

Expected: all commands exit 0.

- [ ] **Step 7: Commit dependency and documentation cleanup**

```bash
git add package.json yarn.lock .yarnrc.yml flake.nix nix/missing-hashes.json Containerfile README.md AGENTS.md docs/PLAN.md src/infrastructure/federation test/unit/infrastructure/federation
git commit -m "refactor(federation): remove BotKit" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 11: Milestone review and acceptance evidence

**Files:**
- Modify only if verification exposes an M7 defect.

**Interfaces:**
- Produces: a raw Fedify implementation whose attribution remains local-feed-only until M8.

- [ ] **Step 1: Verify serialized public contracts**

Run the full E2E suite and inspect one `fedify lookup -a` result for a local fixture post. It must show
one `attributedTo` local feed actor, Public `to`, followers `cc`, source URL, and no author Mention.

- [ ] **Step 2: Run final immutable-install verification**

Run: `yarn install --immutable && yarn typecheck && yarn test && nix build .#`

Expected: all commands exit 0.

- [ ] **Step 3: Inspect status and commit history**

Run: `git status --short && git log --oneline --decorate -10`

Expected: clean worktree and one reviewable commit per task; do not create an empty acceptance commit.
