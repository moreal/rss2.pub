# M8 Atom Author Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve Atom author URIs as ActivityPub Actors and publish them as additional, metadata-only `attributedTo` values with author-only Update support.

**Architecture:** Atom DTOs provide effective raw author URI strings; domain smart constructors canonicalize, deduplicate, and cap candidates; an `ActorResolver` port hides Fedify lookup types. `PollFeed` owns a one-execution Promise memo, passes only confirmed canonical Actor IDs to the gateway, and keeps candidate URIs—not lookup results—in the deterministic content fingerprint.

**Tech Stack:** Node.js 24, TypeScript NodeNext, `@rss2pub/atom-feed`, Fedify/Vocab 2.3.5 line, Drizzle/PostgreSQL, Vitest local fixture servers

**Spec:** `docs/design/2026-08-30-atom-fedify-attribution-design.md`

## Global Constraints

- Start from completed, green M6 and M7 milestones.
- Effective Atom author precedence is entry authors, otherwise source authors, otherwise feed authors.
- Accept only absolute HTTP(S) author URI candidates; canonicalize with `URL.href`, preserve first-seen order, deduplicate, then keep at most 8.
- The final `attributedTo` order is local feed actor first, then resolved external Actor IDs in candidate order; deduplicate canonical IDs again.
- Actor types accepted by Fedify `isActor()` are Application, Group, Organization, Person, and Service; a non-Actor or Actor without ID is omitted.
- Lookup failures never fail publishing or polling and never enter `publishErrors`.
- Memoize URI-to-Promise only within one `PollFeed.execute()`; do not add database, KV, module-global, or cross-poll caches.
- Do not retry an unchanged entry merely because lookup failed; a later content/author Update performs lookup again.
- Author metadata never changes body HTML, Mention tags, `to`, or `cc`.
- Include normalized candidate URI order in `contentFingerprint`; never include resolved Actor IDs or other I/O results.
- No `any`, casts used to silence type errors, non-null assertions, external package types in domain,
  or relative ESM imports without `.js`. Owning smart constructors may use the project's established
  narrow branded-value cast after validation.
- Every commit in this plan contains exactly one `Assisted-by: Codex:gpt-5.6-sol` trailer.
- The milestone is complete only when `yarn typecheck && yarn test && nix build .#` passes.

## File Structure

### Create

- `src/domain/feed/author-uri.ts` — `AuthorUri` and bounded `AttributionCandidates` smart constructors.
- `src/domain/ports/actor-resolver.ts` — Actor lookup port and resolved URI/error types.
- `src/infrastructure/federation/fedify-actor-resolver.ts` — `ctx.lookupObject` adapter.
- `test/unit/domain/feed/author-uri.test.ts`
- `test/unit/infrastructure/federation/fedify-actor-resolver.test.ts`
- `test/unit/infrastructure/telemetry/instrumented-poll.test.ts`

### Modify

- `src/domain/feed/feed-item.ts` — raw/effective author fields and author-aware fingerprint.
- `src/infrastructure/feedfetch/atom-feed-fetcher.ts` — map effective DTO author URIs.
- `src/application/poll-feed.ts` — poll-local Promise memo, best-effort resolution, attribution errors.
- `src/domain/ports/federation-gateway.ts` — additional resolved attribution argument.
- `src/infrastructure/federation/fedify-gateway.ts` — local-first attribution persistence.
- `src/infrastructure/federation/vocab-builders.ts` — serialize plural attributions.
- `src/infrastructure/telemetry/instrumented-poll.ts` — lookup-failure log/metric.
- All FeedItem/RawFeedItem/gateway fakes and unit tests — include author fields/signatures.
- `test/e2e/helpers/fixtures.ts` — author-rich Atom fixtures.
- `test/e2e/remote-federation.test.ts` — local Person/Organization/non-Actor lookup and Update.
- `AGENTS.md`, `README.md`, `docs/PLAN.md` — implemented behavior and constraints.

No dependency or database migration is required; `federation_objects.attributed_to_uris` already exists from M7.

---

### Task 1: Model bounded Atom author URI candidates in the domain

**Files:**
- Create: `src/domain/feed/author-uri.ts`
- Test: `test/unit/domain/feed/author-uri.test.ts`

**Interfaces:**
- Produces: branded `AuthorUri`.
- Produces: `AttributionCandidates.fromRaw(raw: readonly string[]): AttributionCandidates`.
- Produces: `AttributionCandidates.values(candidates): readonly AuthorUri[]`.
- Constant: `MAX_AUTHOR_CANDIDATES = 8`.

- [ ] **Step 1: Write smart-constructor tests**

```ts
describe("AttributionCandidates", () => {
  it("keeps canonical absolute HTTP(S) URLs in first-seen order", () => {
    const candidates = AttributionCandidates.fromRaw([
      " https://EXAMPLE.test:443/users/alice ",
      "https://example.test/users/alice",
      "http://example.test/users/bob",
      "/relative",
      "acct:carol@example.test",
      "javascript:alert(1)",
    ]);
    expect(AttributionCandidates.values(candidates)).toEqual([
      "https://example.test/users/alice",
      "http://example.test/users/bob",
    ]);
  });

  it("deduplicates before taking the first eight", () => {
    const raw = ["https://a.test/1", "https://a.test/1", ...Array.from(
      { length: 9 },
      (_, index) => `https://a.test/${index + 2}`,
    )];
    expect(AttributionCandidates.values(AttributionCandidates.fromRaw(raw))).toHaveLength(8);
    expect(AttributionCandidates.values(AttributionCandidates.fromRaw(raw)).at(-1))
      .toBe("https://a.test/8");
  });
});
```

Also test empty/whitespace strings and URLs with fragments/query strings preserve URL canonical form.

- [ ] **Step 2: Run the test and verify missing module failure**

Run: `yarn test:unit test/unit/domain/feed/author-uri.test.ts`

Expected: FAIL because `author-uri.ts` does not exist.

- [ ] **Step 3: Implement branded URI parsing and the bounded collection**

```ts
export type AuthorUri = Brand<string, "AuthorUri">;
export type AttributionCandidates = Brand<readonly AuthorUri[], "AttributionCandidates">;
export const MAX_AUTHOR_CANDIDATES = 8;

function parseAuthorUri(raw: string): AuthorUri | null {
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.href as AuthorUri;
  } catch {
    return null;
  }
}
```

The final `as AuthorUri` is the owning smart constructor's established narrow brand introduction,
after URL validation; it must not be copied outside this module. Build a new array, Set by canonical
string, stop after eight, and expose it only through readonly accessors.
`AttributionCandidates.fromRaw` introduces the collection brand only after constructing the bounded
readonly array; `values` returns that array without mutation.

- [ ] **Step 4: Run domain tests**

Run: `yarn test:unit test/unit/domain/feed/author-uri.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the author value objects**

```bash
git add src/domain/feed/author-uri.ts test/unit/domain/feed/author-uri.test.ts
git commit -m "feat(domain): model Atom author URI candidates" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 2: Carry effective Atom authors into FeedItem and its fingerprint

**Files:**
- Modify: `src/domain/feed/feed-item.ts`
- Modify: `src/infrastructure/feedfetch/atom-feed-fetcher.ts`
- Modify: `test/unit/domain/feed/feed-item.test.ts`
- Modify: `test/unit/infrastructure/feedfetch/atom-feed-fetcher.test.ts`
- Modify: `test/helpers/fakes.ts`
- Modify: every test literal constructing `RawFeedItem` or `FeedItem`.

**Interfaces:**
- Adds: `RawFeedItem.authorUris: readonly string[]`.
- Adds: `FeedItem.authors: AttributionCandidates`.
- `contentFingerprint(item)` includes candidate URI order.

- [ ] **Step 1: Add parsing and fingerprint tests**

```ts
it("filters raw author URIs through AttributionCandidates", () => {
  const item = unwrap(FeedItem.fromRaw({
    ...rawItem,
    authorUris: ["https://actors.test/a", "relative", "https://actors.test/a"],
  }));
  expect(AttributionCandidates.values(item.authors)).toEqual(["https://actors.test/a"]);
});

it("changes the fingerprint for author-only changes and author order", () => {
  const aThenB = itemWithAuthors(["https://actors.test/a", "https://actors.test/b"]);
  const bThenA = itemWithAuthors(["https://actors.test/b", "https://actors.test/a"]);
  const onlyA = itemWithAuthors(["https://actors.test/a"]);
  expect(contentFingerprint(aThenB)).not.toBe(contentFingerprint(bThenA));
  expect(contentFingerprint(aThenB)).not.toBe(contentFingerprint(onlyA));
});
```

In the adapter test, give the Atom entry two effective authors and assert both URI strings are mapped
in order. Include an author without URI and assert it is omitted.

- [ ] **Step 2: Run focused tests and verify type failures**

Run: `yarn test:unit test/unit/domain/feed/feed-item.test.ts test/unit/infrastructure/feedfetch/atom-feed-fetcher.test.ts`

Expected: FAIL because author fields are absent.

- [ ] **Step 3: Add author fields and deterministic fingerprint encoding**

Map DTO authors with non-null `uri` to `RawFeedItem.authorUris`. In `FeedItem.fromRaw`, call
`AttributionCandidates.fromRaw`. Replace the space-joined fingerprint payload with a JSON array so
field boundaries and author order cannot collide:

```ts
return sha256Hex(JSON.stringify([
  item.title,
  item.contentHtml,
  item.summaryHtml,
  item.link,
  item.publishedAt?.toISOString() ?? null,
  item.language,
  AttributionCandidates.values(item.authors),
]));
```

- [ ] **Step 4: Update every test helper/literal explicitly**

Use `authorUris: []` in raw fixtures and `authors: AttributionCandidates.fromRaw([])` in parsed item
fixtures. Do not make the new field optional; absence would violate the parse-don't-validate rule.

- [ ] **Step 5: Run all domain/application unit tests**

Run: `yarn test:unit test/unit/domain test/unit/application test/unit/infrastructure/feedfetch`

Expected: PASS.

- [ ] **Step 6: Commit author propagation and fingerprinting**

```bash
git add src/domain/feed src/infrastructure/feedfetch test
git commit -m "feat(feed): fingerprint effective Atom authors" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 3: Add the ActorResolver port and Fedify adapter

**Files:**
- Create: `src/domain/ports/actor-resolver.ts`
- Create: `src/infrastructure/federation/fedify-actor-resolver.ts`
- Test: `test/unit/infrastructure/federation/fedify-actor-resolver.test.ts`

**Interfaces:**
- Produces: branded `ResolvedActorUri` and
  `ResolvedActorUri.create(raw): Result<ResolvedActorUri, InvalidResolvedActorUri>`.
- Produces: `ActorResolver.resolve(uri: AuthorUri): Promise<Result<ResolvedActorUri | null, ActorLookupError>>`.
- Produces: `createFedifyActorResolver({ federation, origin }): ActorResolver`.

- [ ] **Step 1: Define the port contract without external types**

```ts
export type ResolvedActorUri = Brand<string, "ResolvedActorUri">;
export type ActorLookupError = {
  readonly type: "ActorLookupFailed";
  readonly uri: AuthorUri;
  readonly message: string;
};
export type ActorResolver = {
  resolve(uri: AuthorUri): Promise<Result<ResolvedActorUri | null, ActorLookupError>>;
};
```

Add `InvalidResolvedActorUri` with `NotAUrl` and `UnsupportedProtocol` variants and a
`ResolvedActorUri.create` smart constructor mirroring the validated branded pattern in `IconUrl`.

- [ ] **Step 2: Write adapter tests with a local document loader**

Test a Person, Organization, Service, remote Note, Actor without ID, malformed JSON-LD, HTTP failure,
and a document whose returned ID has another origin. Assert Actor classes return canonical `id`,
non-Actors/ID-less/cross-origin default return `ok(null)`, and thrown lookup errors return typed `err`.

- [ ] **Step 3: Run tests and verify missing adapter failure**

Run: `yarn test:unit test/unit/infrastructure/federation/fedify-actor-resolver.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 4: Implement the Fedify lookup adapter**

Create one context with `federation.createContext(new URL(origin), undefined)`. For each call:

```ts
const object = await context.lookupObject(new URL(uri), { crossOrigin: "ignore" });
if (!isActor(object) || object.id === null) return ok(null);
const parsed = ResolvedActorUri.create(object.id.href);
return parsed.ok ? ok(parsed.value) : ok(null);
```

Define `ResolvedActorUri.create` in the port module as a domain smart constructor that accepts only
absolute HTTP(S) canonical IDs; if it fails, return `ok(null)`. Catch all loader/JSON-LD failures and return
`ActorLookupFailed` with `messageOf(cause)`.

- [ ] **Step 5: Run resolver tests and architecture search**

Run: `yarn test:unit test/unit/infrastructure/federation/fedify-actor-resolver.test.ts && yarn typecheck`

Run: `rg -n "@fedify|Actor" src/domain/ports/actor-resolver.ts src/domain/feed/author-uri.ts`

Expected: tests/typecheck PASS; no external import exists in domain files.

- [ ] **Step 6: Commit the lookup port and adapter**

```bash
git add src/domain/ports/actor-resolver.ts src/infrastructure/federation/fedify-actor-resolver.ts test/unit/infrastructure/federation/fedify-actor-resolver.test.ts
git commit -m "feat(federation): resolve Atom authors as Actors" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 4: Resolve authors once per poll and expose lookup failures separately

**Files:**
- Modify: `src/application/poll-feed.ts`
- Modify: `src/domain/ports/federation-gateway.ts`
- Modify: `test/helpers/fakes.ts`
- Modify: `test/unit/application/poll-feed.test.ts`
- Modify: `src/infrastructure/telemetry/instrumented-poll.ts`

**Interfaces:**
- Adds: `actorResolver: ActorResolver` dependency to `createPollFeed`.
- Adds: `additionalAttributions: readonly ResolvedActorUri[]` to gateway publish/update.
- Adds: `attributionErrors: readonly string[]` to every `PollFeedReport` branch.
- Changes: `instrumentPollFeed(inner, { meter?, tracer? } = {})`; production defaults to global OTel,
  tests inject a `Meter` and `Tracer`.

- [ ] **Step 1: Write application tests for order, memoization, and failure isolation**

Add tests that:

- publish two entries sharing one author and assert resolver call count is one;
- resolve A, fail B, return non-Actor C, resolve D, and assert gateway receives `[A, D]` in order;
- leave an unchanged existing item alone and assert no lookup occurs;
- change only author URI and assert one Update occurs;
- fail lookup during Update and assert Update still occurs with an empty additional list;
- put failures in `attributionErrors` while `publishErrors` remains empty and status remains `polled`.

- [ ] **Step 2: Run poll tests and verify signature failures**

Run: `yarn test:unit test/unit/application/poll-feed.test.ts`

Expected: FAIL because resolver and gateway attribution arguments do not exist.

- [ ] **Step 3: Implement a poll-local Promise memo**

Create the Map inside `execute`, after a successful fetched response and before publish/update loops:

```ts
const actorMemo = new Map<AuthorUri, Promise<Result<ResolvedActorUri | null, ActorLookupError>>>();
```

For each candidate, reuse the stored Promise or immediately store `deps.actorResolver.resolve(uri)`.
Use `Promise.all` over candidates so result order remains input order. Deduplicate successful canonical
IDs in a fresh Set. Collect error messages separately; do not reject the whole resolution.

- [ ] **Step 4: Pass confirmed actors to both gateway paths**

Resolve only inside the publish/update loops, after deciding an item actually needs federation work.
Pass the result as the final gateway argument. Initialize `attributionErrors: []` in fetched-failed,
not-modified, and no-author branches.

- [ ] **Step 5: Instrument failures without changing poll success metrics**

Move tracer/meter/counter creation inside `instrumentPollFeed` so optional injected instruments are
honored. Add counter `rss2pub.poll.author_lookup_failures`. On a successful `PollFeedReport`, add its
error count and log each message at warn under `rss2pub.poll`; do not record it as a poll or publish
failure.

- [ ] **Step 6: Run application and telemetry tests**

Run: `yarn test:unit test/unit/application/poll-feed.test.ts test/unit/infrastructure/telemetry/instrumented-poll.test.ts`

Expected: PASS. The telemetry test wraps a poll returning two `attributionErrors`, asserts the report
remains successful, and observes a counter addition of 2 through the test meter reader.

- [ ] **Step 7: Commit poll-local author resolution**

```bash
git add src/application/poll-feed.ts src/domain/ports/federation-gateway.ts src/infrastructure/telemetry test/helpers test/unit/application test/unit/infrastructure/telemetry
git commit -m "feat(poll): resolve authors once per poll" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 5: Persist and serialize plural `attributedTo`

**Files:**
- Modify: `src/infrastructure/federation/fedify-gateway.ts`
- Modify: `src/infrastructure/federation/vocab-builders.ts`
- Modify: `test/unit/infrastructure/federation/vocab-builders.test.ts`
- Modify: `test/unit/infrastructure/federation/fedify-stack.test.ts`

**Interfaces:**
- Consumes: additional `ResolvedActorUri[]` from Task 4.
- Produces: `attributedToUris = [localActorUri, ...canonicalExternalActors]` in stored rows.

- [ ] **Step 1: Add local-first and metadata-isolation tests**

Build a post with duplicate external actor IDs and assert serialized JSON-LD has exactly:

```json
"attributedTo": [
  "https://local.test/ap/actor/feed_a",
  "https://actors.test/alice",
  "https://actors.test/org"
]
```

Compare a no-author and author-rich object and assert `content`, `tag`, `to`, and `cc` are deeply equal.
Assert an author-only Update keeps object ID/kind/body/audiences and replaces only attribution plus
`updated`.

- [ ] **Step 2: Run builder/stack tests and verify failure**

Run: `yarn test:unit test/unit/infrastructure/federation/vocab-builders.test.ts test/unit/infrastructure/federation/fedify-stack.test.ts`

Expected: FAIL because the gateway ignores the new argument.

- [ ] **Step 3: Centralize local-first attribution composition**

In the gateway, create the local actor URI from context. Iterate local plus external strings, keep the
first occurrence in a Set, and store the result. Never create `Mention` records for authors. Apply the
same helper in publish and Update; an empty external list replaces old external attributions with only
the local actor.

- [ ] **Step 4: Serialize every stored attribution**

Set Vocab `attributions`/equivalent plural constructor field from every stored URI. Confirm the
compacted JSON-LD uses an array when multiple values exist and that `fedify lookup -a` displays each
actor. Do not set `tags`, `tos`, or `ccs` from attribution values.

- [ ] **Step 5: Run focused federation unit tests**

Run: `yarn test:unit test/unit/infrastructure/federation`

Expected: PASS.

- [ ] **Step 6: Commit plural attribution serialization**

```bash
git add src/infrastructure/federation test/unit/infrastructure/federation
git commit -m "feat(federation): publish plural author attribution" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 6: Wire the resolver and prove author behavior end to end

**Files:**
- Modify: `src/web/app.ts`
- Modify: `test/e2e/helpers/fixtures.ts`
- Modify: `test/e2e/remote-federation.test.ts`

**Interfaces:**
- Composition root injects `createFedifyActorResolver({ federation, origin })` into `createPollFeed`.
- E2E uses only local HTTP/Fedify actor fixtures; no public internet.

- [ ] **Step 1: Extend the remote fixture federation**

Serve:

- `Person` at `/users/alice` whose canonical ID is that URL;
- `Organization` at `/users/editors`;
- `Note` at `/objects/not-an-actor`;
- one 404 URI;
- one alias URL that resolves to the same canonical Alice ID on the same origin.

Record Actor document request counts by path.

- [ ] **Step 2: Add a rich Atom entry and publication assertions**

Give one entry authors `[alice, editors, not-an-actor, 404, alice-alias]`, poll it, fetch its local
ActivityPub object, and assert:

- attribution is `[localFeedActor, alice, editors]`;
- body bytes equal the no-author rendering;
- tags contain no author Mention;
- `to` is Public and `cc` is only local followers;
- Alice's canonical ID appears once;
- every candidate path is requested once in that poll.

- [ ] **Step 3: Add author-only Update assertions**

Change only the Atom author list from Alice+Editors to Editors, change the fixture ETag, tick the
scheduler, and assert the remote inbox receives `Update` for the same object ID. Dereference it and
assert attribution is `[localFeedActor, editors]` while content/audiences are unchanged.

- [ ] **Step 4: Add unchanged-poll no-retry assertion**

Run another poll with semantically identical entry data but a new feed response. Assert no new Actor
document request and no Update. This proves lookup failures/non-Actors do not cause retry by
themselves.

- [ ] **Step 5: Wire the production resolver and run E2E**

Create the resolver from the same raw federation instance before constructing `PollFeed`; pass it to
the use case. Preserve `allowPrivateAddress` only through test config.

Run: `yarn test:e2e test/e2e/remote-federation.test.ts`

Expected: all Follow/Create/Update/Delete/command and author assertions PASS.

- [ ] **Step 6: Commit end-to-end attribution**

```bash
git add src/web/app.ts test/e2e
git commit -m "test: verify Atom authors over federation" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 7: Update guidance and run final acceptance

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/PLAN.md`

**Interfaces:**
- Documents exact maximums, failure behavior, memo lifetime, and metadata isolation.

- [ ] **Step 1: Document implemented author semantics**

State:

- effective Atom author precedence entry/source/feed;
- absolute HTTP(S), dedupe-before-limit, at most 8 candidates;
- local actor first, maximum 9 final attributions;
- lookup failure/non-Actor omission;
- one lookup per URI per poll and no persistent retry cache;
- author-only Update;
- body/Mention/`to`/`cc` unchanged.

Mark M8 complete in `docs/PLAN.md` and add ADR-0014 to the AGENTS key-decision table.

- [ ] **Step 2: Search for accidental mention/audience coupling**

Run: `rg -n "author.*Mention|Mention.*author|author.*tos|author.*ccs" src test`

Expected: matches only negative assertions/comments, not implementation coupling.

- [ ] **Step 3: Run the complete quality gate**

Run: `yarn install --immutable && yarn typecheck && yarn test && yarn build && nix build .#`

Expected: all commands exit 0.

- [ ] **Step 4: Run a local CLI acceptance lookup**

With the E2E fixture app running, run `fedify lookup -a <local-object-url>` and confirm the printed
attributions are local feed actor, Person, Organization in order, with unchanged body and no author
Mention tags. Record the command/output in the implementation handoff; do not commit fixture runtime
artifacts.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md AGENTS.md docs/PLAN.md
git commit -m "docs: describe Atom author attribution" -m "Assisted-by: Codex:gpt-5.6-sol"
```

- [ ] **Step 6: Verify clean status and commit trailers**

Run: `git status --short && git log --format='%h%n%B%n---' -7`

Expected: clean worktree; every M8 commit contains exactly one
`Assisted-by: Codex:gpt-5.6-sol` trailer.
