# M6 Atom-only Feed Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace RSS/rss-parser input with a strict, independently built Atom 1.0 parser workspace package while keeping the existing BotKit federation behavior green.

**Architecture:** `@rss2pub/atom-feed` owns pure XML-to-DTO parsing through `saxes`; the root infrastructure adapter retains HTTP, conditional requests, timeouts, response limits, and DTO-to-domain mapping. The domain and application layers remain unaware of XML and of the workspace package.

**Tech Stack:** Node.js 24, TypeScript NodeNext, Yarn Berry workspaces, saxes 6.x, Vitest, Hono, Lingui, Nix yarn-berry fetcher

**Spec:** `docs/design/2026-08-30-atom-fedify-attribution-design.md`

## Global Constraints

- Accept only Atom 1.0 documents whose root is `{http://www.w3.org/2005/Atom}feed`; reject RSS without fallback.
- Reject DOCTYPE, inputs deeper than 64 elements, or inputs containing more than 100,000 XML nodes.
- Reject HTTP response bodies larger than 5 MiB before decoding the complete document.
- Keep HTTP, timers, fetch, conditional request headers, and root domain mapping outside `packages/atom-feed`.
- `packages/atom-feed` must not import from `src`, Node built-ins, Fedify, Hono, or database packages.
- Preserve Atom author `name`/`uri`/`email` and entry/source/feed inheritance in the DTO, but do not publish author attribution in M6.
- Domain imports remain inward-only; expected failures use discriminated Result values; no `any`,
  casts used to silence errors, or non-null assertions. Owning branded smart constructors may use the
  established narrow cast after validation.
- All relative ESM imports end in `.js`.
- Every commit in this plan contains exactly one `Assisted-by: Codex:gpt-5.6-sol` trailer.
- The milestone is complete only when `yarn typecheck && yarn test && nix build .#` passes.

## File Structure

### Create

- `packages/atom-feed/package.json` — workspace manifest and build entry points.
- `packages/atom-feed/tsconfig.json` — package typecheck configuration.
- `packages/atom-feed/tsconfig.build.json` — emits `packages/atom-feed/dist`.
- `packages/atom-feed/src/model.ts` — public DTO, limit, and parse-result types.
- `packages/atom-feed/src/xml.ts` — strict bounded namespace-aware XML tree builder.
- `packages/atom-feed/src/atom.ts` — Atom direct-child selection, text constructs, metadata, author inheritance.
- `packages/atom-feed/src/index.ts` — public exports.
- `packages/atom-feed/test/xml.test.ts` — malformed XML, namespace, DOCTYPE, and limit tests.
- `packages/atom-feed/test/atom.test.ts` — metadata, content, language, and author inheritance tests.
- `src/infrastructure/feedfetch/atom-feed-fetcher.ts` — HTTP/conditional fetch adapter.
- `test/unit/infrastructure/feedfetch/atom-feed-fetcher.test.ts` — adapter and response-limit tests.

### Modify

- `package.json`, `yarn.lock` — workspace and dependency graph.
- `vitest.config.ts` — include workspace tests.
- `src/domain/ports/feed-fetcher.ts` — Atom-only contract documentation.
- `src/domain/feed/feed-item.ts`, `src/infrastructure/persistence/schema.ts` — remove RSS-specific comments only.
- `src/web/app.ts` — compose `createAtomFeedFetcher`.
- `src/infrastructure/federation/botkit-stack.ts` — Atom-only main actor summary while BotKit remains.
- `src/application/handle-command.ts` — Atom-only bot help and feed-read errors.
- `test/e2e/helpers/fixtures.ts`, `test/e2e/helpers/fixture-feed-server.ts` — Atom-only fixtures/default MIME.
- All `test/e2e/*.test.ts` using `rssFixture` — convert inputs to Atom.
- `src/web/ui/messages.ts`, `src/web/locales/en.po`, `src/web/locales/ko.po`, generated catalogs — Atom-only user copy.
- `README.md`, `AGENTS.md`, `package.json`, `flake.nix`, `Containerfile` — Atom-only description and workspace packaging.
- `nix/missing-hashes.json`, `flake.nix` — lockfile-derived Nix cache values.

### Delete

- `src/infrastructure/feedfetch/rss-parser-fetcher.ts`
- `test/unit/infrastructure/feedfetch/rss-parser-fetcher.test.ts`

---

### Task 1: Scaffold the parser workspace and enforce strict XML boundaries

**Files:**
- Create: `packages/atom-feed/package.json`
- Create: `packages/atom-feed/tsconfig.json`
- Create: `packages/atom-feed/tsconfig.build.json`
- Create: `packages/atom-feed/src/model.ts`
- Create: `packages/atom-feed/src/xml.ts`
- Create: `packages/atom-feed/src/index.ts`
- Test: `packages/atom-feed/test/xml.test.ts`
- Modify: `package.json`
- Modify: `vitest.config.ts`

**Interfaces:**
- Produces: `parseAtom(xml: string, limits?: Partial<AtomParserLimits>): AtomParseResult`.
- Produces: `DEFAULT_ATOM_LIMITS = { maxDepth: 64, maxNodes: 100_000 }`.
- Produces: `AtomParseError` variants `MalformedXml`, `NotAtomFeed`, `UnsafeXml`, `LimitExceeded`.

- [ ] **Step 1: Write strict-boundary tests before creating the package implementation**

```ts
import { describe, expect, it } from "vitest";
import { parseAtom } from "../src/index.js";

const NS = "http://www.w3.org/2005/Atom";

describe("parseAtom XML boundary", () => {
  it("accepts only an Atom-namespaced feed root", () => {
    expect(parseAtom(`<feed xmlns="${NS}"><id>urn:f</id><title>F</title></feed>`).ok)
      .toBe(true);
    expect(parseAtom("<rss><channel/></rss>")).toMatchObject({
      ok: false,
      error: { type: "NotAtomFeed" },
    });
    expect(parseAtom("<feed><title>not namespaced</title></feed>")).toMatchObject({
      ok: false,
      error: { type: "NotAtomFeed" },
    });
  });

  it("rejects malformed XML and DOCTYPE", () => {
    expect(parseAtom(`<feed xmlns="${NS}"><entry></feed>`)).toMatchObject({
      ok: false,
      error: { type: "MalformedXml" },
    });
    expect(parseAtom(`<!DOCTYPE feed><feed xmlns="${NS}"/>`)).toMatchObject({
      ok: false,
      error: { type: "UnsafeXml" },
    });
  });

  it("enforces depth and node limits", () => {
    expect(parseAtom(`<feed xmlns="${NS}"><a><b/></a></feed>`, { maxDepth: 2 }))
      .toMatchObject({ ok: false, error: { type: "LimitExceeded", limit: "depth" } });
    expect(parseAtom(`<feed xmlns="${NS}"><a/><b/></feed>`, { maxNodes: 2 }))
      .toMatchObject({ ok: false, error: { type: "LimitExceeded", limit: "nodes" } });
  });
});
```

- [ ] **Step 2: Run the package test and verify that the missing module fails**

Run: `yarn vitest run packages/atom-feed/test/xml.test.ts`

Expected: FAIL because `packages/atom-feed/src/index.ts` does not exist.

- [ ] **Step 3: Add the workspace manifests and public result types**

`packages/atom-feed/package.json`:

```json
{
  "name": "@rss2pub/atom-feed",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "build": "tsc -p tsconfig.build.json",
    "test": "vitest run test"
  },
  "dependencies": {
    "saxes": "^6.0.0"
  },
  "devDependencies": {
    "typescript": "^7.0.2",
    "vitest": "^4.1.10"
  }
}
```

Add to the root manifest:

```json
{
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "yarn workspace @rss2pub/atom-feed build && node --watch --env-file-if-exists=.env --import tsx src/web/main.ts",
    "typecheck": "yarn workspace @rss2pub/atom-feed typecheck && tsc --noEmit",
    "build": "yarn workspace @rss2pub/atom-feed build && tsc -p tsconfig.build.json",
    "test": "yarn workspace @rss2pub/atom-feed build && vitest run",
    "test:unit": "yarn workspace @rss2pub/atom-feed build && vitest run --project unit",
    "test:e2e": "yarn workspace @rss2pub/atom-feed build && vitest run --project e2e"
  },
  "dependencies": {
    "@rss2pub/atom-feed": "workspace:*"
  }
}
```

Add `"packages/*/test/**/*.test.ts"` to the unit project's `include` array in `vitest.config.ts`.
The package's own tsconfig extends `../../tsconfig.json`, excludes `dist`, and includes `src` plus
`test`; its build config includes only `src`. Root typecheck invokes the package typecheck explicitly,
so the root `tsconfig.json` include array remains focused on root source/tests.

Define the public model in `model.ts`:

```ts
export type AtomParserLimits = {
  readonly maxDepth: number;
  readonly maxNodes: number;
};

export const DEFAULT_ATOM_LIMITS: AtomParserLimits = {
  maxDepth: 64,
  maxNodes: 100_000,
};

export type AtomParseError =
  | { readonly type: "MalformedXml"; readonly message: string }
  | { readonly type: "NotAtomFeed" }
  | { readonly type: "UnsafeXml"; readonly construct: "DOCTYPE" }
  | { readonly type: "LimitExceeded"; readonly limit: "depth" | "nodes" };

export type AtomParseResult =
  | { readonly ok: true; readonly value: AtomFeedDto }
  | { readonly ok: false; readonly error: AtomParseError };
```

Define the complete `AtomAuthorDto`, `AtomTextDto`, `AtomEntryDto`, and `AtomFeedDto` shapes shown in
Task 2 now; Task 1 returns empty/null metadata except for the validated root, and Task 2 fills the
semantic parser. This keeps every commit on the final public type contract.

- [ ] **Step 4: Implement a bounded `saxes` tree and root check**

Use an internal tree that retains namespace URI, local name, qualified name, attributes, and child order:

```ts
export type XmlNode = XmlElement | { readonly type: "text"; readonly value: string };
export type XmlElement = {
  readonly type: "element";
  readonly namespace: string;
  readonly localName: string;
  readonly qualifiedName: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: readonly XmlNode[];
};
```

Create `SaxesParser({ xmlns: true })`, push a mutable frame on `opentag`, append text/CDATA on
`text`/`cdata`, freeze a frame on `closetag`, and convert parser `error` to `MalformedXml`. Throw an
internal sentinel as soon as `doctype` fires or either counter exceeds its limit; catch the sentinel
and return its typed `AtomParseError`. After close, require exactly one root and check both
`root.namespace` and `root.localName`.

- [ ] **Step 5: Install, run the boundary test, and typecheck the package**

Run: `yarn install`

Run: `yarn vitest run packages/atom-feed/test/xml.test.ts && yarn workspace @rss2pub/atom-feed typecheck`

Expected: all boundary tests PASS and package typecheck exits 0.

- [ ] **Step 6: Commit the strict parser foundation**

```bash
git add package.json yarn.lock vitest.config.ts packages/atom-feed
git commit -m "feat(atom): add strict XML parser workspace" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 2: Parse Atom metadata and text constructs

**Files:**
- Modify: `packages/atom-feed/src/model.ts`
- Create: `packages/atom-feed/src/atom.ts`
- Modify: `packages/atom-feed/src/index.ts`
- Test: `packages/atom-feed/test/atom.test.ts`

**Interfaces:**
- Consumes: bounded `XmlElement` from Task 1.
- Produces: `AtomTextDto`, `AtomFeedDto`, and `AtomEntryDto` with nullable metadata.
- Produces: `textValue(text)` for flattened display text and text/html/xhtml values suitable for the root adapter.

- [ ] **Step 1: Write metadata and mixed-content tests**

```ts
it("parses direct Atom children without capturing nested lookalikes", () => {
  const result = parseAtom(`<feed xmlns="${NS}" xml:lang="en">
    <id>urn:feed</id><title>Feed title</title><subtitle type="html">A &lt;b&gt;feed&lt;/b&gt;</subtitle>
    <link rel="self" href="https://example.test/feed.xml"/>
    <link rel="alternate" href="https://example.test/"/>
    <entry><id>urn:one</id><title>One</title>
      <content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml">Hello <b>world</b>.</div></content>
      <updated>2026-08-30T00:00:00Z</updated>
    </entry>
  </feed>`);
  expect(result).toMatchObject({
    ok: true,
    value: {
      id: "urn:feed",
      title: { type: "text", value: "Feed title", plainText: "Feed title" },
      subtitle: { type: "html", value: "A <b>feed</b>", plainText: "A feed" },
      link: "https://example.test/",
      language: "en",
      entries: [{ id: "urn:one", content: { type: "xhtml", value: "Hello <b>world</b>." } }],
    },
  });
});
```

Also test default `type="text"`, HTML entity decoding, XHTML prefix/default namespace forms, first
`rel="alternate"` selection, `published` preference over `updated`, and that a nested `<source><title>`
does not replace the entry title.

- [ ] **Step 2: Run the metadata test and verify missing DTO behavior**

Run: `yarn vitest run packages/atom-feed/test/atom.test.ts`

Expected: FAIL because Task 1 returns empty/null metadata and has no text-construct parser.

- [ ] **Step 3: Define the complete DTOs**

```ts
export type AtomTextDto = {
  readonly type: "text" | "html" | "xhtml";
  readonly value: string;
  readonly plainText: string;
};

export type AtomAuthorDto = {
  readonly name: string | null;
  readonly uri: string | null;
  readonly email: string | null;
};

export type AtomEntryDto = {
  readonly id: string | null;
  readonly link: string | null;
  readonly title: AtomTextDto | null;
  readonly summary: AtomTextDto | null;
  readonly content: AtomTextDto | null;
  readonly published: string | null;
  readonly updated: string | null;
  readonly language: string | null;
  readonly authors: readonly AtomAuthorDto[];
};

export type AtomFeedDto = {
  readonly id: string | null;
  readonly title: AtomTextDto | null;
  readonly subtitle: AtomTextDto | null;
  readonly link: string | null;
  readonly language: string | null;
  readonly authors: readonly AtomAuthorDto[];
  readonly entries: readonly AtomEntryDto[];
};
```

- [ ] **Step 4: Implement direct-child selectors and text construct conversion**

In `atom.ts`, match Atom elements by both namespace and local name. For `text`, use descendant text.
For `html`, use the decoded descendant text value as HTML and derive `plainText` by stripping tags.
For `xhtml`, require one XHTML `div`, serialize only its children in order, escape XML text/attribute
values, and derive `plainText` from descendant text. Unknown `type` values become `text` rather than
enabling arbitrary markup.

- [ ] **Step 5: Run package tests**

Run: `yarn vitest run packages/atom-feed/test`

Expected: strict-boundary and metadata tests PASS.

- [ ] **Step 6: Commit Atom metadata parsing**

```bash
git add packages/atom-feed
git commit -m "feat(atom): parse Atom metadata and text constructs" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 3: Implement `xml:lang` and author inheritance

**Files:**
- Modify: `packages/atom-feed/src/xml.ts`
- Modify: `packages/atom-feed/src/atom.ts`
- Test: `packages/atom-feed/test/atom.test.ts`

**Interfaces:**
- Consumes: `AtomAuthorDto` and `AtomEntryDto` from Task 2.
- Produces: effective entry `language` and `authors` values.
- Inheritance: entry authors, otherwise source authors, otherwise feed authors.

- [ ] **Step 1: Add inheritance tests**

```ts
it("inherits authors entry -> source -> feed and preserves order", () => {
  const result = parseAtom(`<feed xmlns="${NS}" xml:lang="en">
    <title>F</title>
    <author><name>Feed A</name><uri>https://actors.test/feed-a</uri></author>
    <author><name>Feed B</name><uri>https://actors.test/feed-b</uri></author>
    <entry xml:lang="ko"><id>1</id><title>1</title><updated>2026-08-30T00:00:00Z</updated>
      <author><name>Entry A</name><uri>https://actors.test/entry</uri><email>a@example.test</email></author>
    </entry>
    <entry><id>2</id><title>2</title><updated>2026-08-30T00:00:00Z</updated>
      <source><author><name>Source A</name><uri>https://actors.test/source</uri></author></source>
    </entry>
    <entry><id>3</id><title>3</title><updated>2026-08-30T00:00:00Z</updated></entry>
  </feed>`);
  if (!result.ok) throw new Error(result.error.type);
  expect(result.value.entries.map((entry) => ({ language: entry.language, authors: entry.authors })))
    .toEqual([
      { language: "ko", authors: [{ name: "Entry A", uri: "https://actors.test/entry", email: "a@example.test" }] },
      { language: "en", authors: [{ name: "Source A", uri: "https://actors.test/source", email: null }] },
      { language: "en", authors: [
        { name: "Feed A", uri: "https://actors.test/feed-a", email: null },
        { name: "Feed B", uri: "https://actors.test/feed-b", email: null },
      ] },
    ]);
});
```

Add a second test for `xml:lang=""` clearing an inherited language and for source authors not being
used when the entry has at least one author.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `yarn vitest run packages/atom-feed/test/atom.test.ts -t "inherits authors"`

Expected: FAIL because Task 2 returns empty author arrays and only root language.

- [ ] **Step 3: Track XML language scope and parse authors**

Store the XML namespace attribute under key `{http://www.w3.org/XML/1998/namespace}lang`. Implement
`effectiveLanguage(element, inherited)` so a present empty value returns `null`; otherwise trim and
inherit. Implement `authorsOf(parent)` using direct Atom `author` children and direct `name`, `uri`,
`email` children. Do not validate or resolve URI values in this package.

- [ ] **Step 4: Apply exact Atom inheritance precedence**

For every entry:

```ts
const entryAuthors = authorsOf(entry);
const sourceAuthors = directChild(entry, "source") === null
  ? []
  : authorsOf(directChild(entry, "source"));
const effectiveAuthors = entryAuthors.length > 0
  ? entryAuthors
  : sourceAuthors.length > 0
    ? sourceAuthors
    : feedAuthors;
```

Compute entry language from the root language and entry XML scope. Return new readonly arrays rather
than sharing mutable parser frames.

- [ ] **Step 5: Run all package tests and typecheck**

Run: `yarn vitest run packages/atom-feed/test && yarn workspace @rss2pub/atom-feed typecheck`

Expected: PASS.

- [ ] **Step 6: Commit Atom inheritance semantics**

```bash
git add packages/atom-feed
git commit -m "feat(atom): implement language and author inheritance" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 4: Replace `rss-parser` with the Atom HTTP adapter

**Files:**
- Create: `src/infrastructure/feedfetch/atom-feed-fetcher.ts`
- Delete: `src/infrastructure/feedfetch/rss-parser-fetcher.ts`
- Create: `test/unit/infrastructure/feedfetch/atom-feed-fetcher.test.ts`
- Delete: `test/unit/infrastructure/feedfetch/rss-parser-fetcher.test.ts`
- Modify: `src/domain/ports/feed-fetcher.ts`
- Modify: `src/web/app.ts`

**Interfaces:**
- Consumes: `parseAtom(body)` from `@rss2pub/atom-feed`.
- Produces: `createAtomFeedFetcher({ timeoutMs?, userAgent?, maxResponseBytes? }): FeedFetcher`.
- Default `maxResponseBytes`: `5 * 1024 * 1024`.

- [ ] **Step 1: Write adapter tests with a stubbed global fetch**

Cover these exact cases:

```ts
it("maps Atom DTO fields and validators", async () => {
  fetchMock.mockResolvedValue(new Response(atomXml, {
    headers: { etag: '"v1"', "last-modified": "Sun, 30 Aug 2026 00:00:00 GMT" },
  }));
  const result = await createAtomFeedFetcher().fetch(feedUrl, {
    etag: null,
    lastModified: null,
  });
  expect(result).toMatchObject({
    ok: true,
    value: {
      status: "fetched",
      feed: {
        title: "Feed title",
        description: "Feed summary",
        link: "https://example.test/",
        language: "en",
        items: [{
          guid: "urn:entry:1",
          link: "https://example.test/one",
          title: "Entry one",
          contentHtml: "<p>Hello</p>",
          summaryHtml: "Short",
          language: "ko",
        }],
      },
      validators: { etag: '"v1"' },
    },
  });
});
```

Also assert conditional headers and 304, RSS returns `InvalidFeedFormat`, malformed Atom returns
`InvalidFeedFormat`, non-2xx returns `RequestFailed`, timeout returns `RequestFailed`, and a body one
byte over an injected 32-byte limit returns `InvalidFeedFormat` without calling `parseAtom`.

- [ ] **Step 2: Run the adapter test and verify failure**

Run: `yarn test:unit test/unit/infrastructure/feedfetch/atom-feed-fetcher.test.ts`

Expected: FAIL because `createAtomFeedFetcher` does not exist.

- [ ] **Step 3: Implement streaming response limit and Atom mapping**

Set `Accept` to:

```ts
const ACCEPT = "application/atom+xml, application/xml;q=0.9, text/xml;q=0.8";
const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
```

Read `response.body` with `getReader()`, add each `Uint8Array.byteLength`, cancel and return
`InvalidFeedFormat` when the limit is exceeded, then decode once with `TextDecoder`. Map `content ??
summary` to `contentHtml`; text constructs must HTML-escape text values, while html/xhtml values pass
through for the existing sanitizer. Map `publishedAt` from `published ?? updated`, returning `null`
for an invalid date. Do not map DTO authors yet; M8 adds the domain policy.

- [ ] **Step 4: Wire the adapter and remove RSS-specific contract text**

Change `src/web/app.ts` to call `createAtomFeedFetcher()`. Update `FeedFetcher` documentation to say
Atom 1.0 only and update the `FetchedFeed.link`/`language` comments. Remove only RSS-specific comments
from domain/schema files; do not change their runtime fields.

- [ ] **Step 5: Run focused root tests**

Run: `yarn test:unit test/unit/infrastructure/feedfetch/atom-feed-fetcher.test.ts test/unit/application/register-feed.test.ts test/unit/application/poll-feed.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the root Atom adapter**

```bash
git add src test/unit/infrastructure test/unit/application
git commit -m "feat(feedfetch): accept Atom feeds only" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 5: Convert every end-to-end feed fixture to Atom

**Files:**
- Modify: `test/e2e/helpers/fixtures.ts`
- Modify: `test/e2e/helpers/fixture-feed-server.ts`
- Modify: `test/e2e/actor-icon.test.ts`
- Modify: `test/e2e/federation.test.ts`
- Modify: `test/e2e/full-content.test.ts`
- Modify: `test/e2e/remote-federation.test.ts`

**Interfaces:**
- Produces: one `atomFixture()` helper used by all feed-source E2E tests.
- `atomFixture` supports feed `link`, feed/entry `language`, entry authors, `summary`, `contentHtml`,
  `published`, and `updated`.

- [ ] **Step 1: Extend `atomFixture` and delete `rssFixture`**

Use this input shape:

```ts
type AtomAuthor = { readonly name: string; readonly uri?: string; readonly email?: string };
type AtomEntry = {
  readonly id?: string;
  readonly link?: string;
  readonly title?: string;
  readonly summary?: string;
  readonly contentHtml?: string;
  readonly published?: string;
  readonly updated?: string;
  readonly language?: string;
  readonly authors?: readonly AtomAuthor[];
};
```

Escape XML text/attribute values in the helper instead of interpolating raw values. Render HTML
summary/content as escaped `type="html"` text, not CDATA, so parser entity decoding is exercised.
Set fixture server default MIME to `application/atom+xml`.

- [ ] **Step 2: Convert each RSS fixture call without changing its assertions**

Map fields exactly:

```ts
rssFixture({ guid, description, contentEncoded, pubDate })
// becomes
atomFixture({
  id: guid,
  summary: description,
  contentHtml: contentEncoded,
  published: new Date(pubDate).toISOString(),
})
```

Keep chronological values equivalent. Add `<link rel="alternate">` at the feed level for favicon
tests. Remove all `rssFixture` imports and verify `rg "rssFixture" test` returns no matches.

- [ ] **Step 3: Run E2E and diagnose only format-related failures**

Run: `yarn test:e2e`

Expected: all existing behavior assertions PASS using Atom inputs.

- [ ] **Step 4: Add an explicit RSS rejection E2E**

In `test/e2e/federation.test.ts`, register a local `<rss>` fixture and assert the registration page
contains the existing invalid-feed error and no actor WebFinger resource is created.

- [ ] **Step 5: Run E2E again**

Run: `yarn test:e2e`

Expected: PASS, including the new RSS rejection test.

- [ ] **Step 6: Commit the Atom fixture conversion**

```bash
git add test/e2e
git commit -m "test: run feed scenarios against Atom fixtures" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 6: Remove RSS product copy and compile catalogs

**Files:**
- Modify: `src/web/ui/messages.ts`
- Modify: `src/web/locales/en.po`
- Modify: `src/web/locales/ko.po`
- Modify: `src/web/locales/en.ts`
- Modify: `src/web/locales/ko.ts`
- Modify: `src/infrastructure/federation/botkit-stack.ts`
- Modify: `src/application/handle-command.ts`
- Modify: `test/unit/web/i18n.test.ts`
- Modify: `test/unit/web/routes.test.ts`
- Modify: `README.md`
- Modify: `AGENTS.md`

**Interfaces:**
- User-facing product name remains `rss2.pub`; only supported input wording changes to Atom.

- [ ] **Step 1: Change descriptors to exact Atom-only English copy**

Use these messages:

```text
Follow Atom feeds from the fediverse.
Follow any Atom feed from the fediverse
rss2.pub turns an Atom feed into a fediverse account anyone can follow.
The address of the Atom feed itself, not the website — it often ends in /atom or .xml.
Couldn’t read an Atom feed there: {message}
```

Change the main actor summary to `I turn Atom feeds into followable accounts...`. Update tests to
assert Atom wording and to assert rendered pages contain neither `RSS feed` nor `RSS or Atom`. Change
`HELP_TEXT` and the command handler's `FeedUnreachable` reply to say Atom rather than RSS/Atom or a
generic feed; update `test/unit/application/handle-command.test.ts` accordingly.

- [ ] **Step 2: Extract catalogs and add exact Korean translations**

Run: `yarn i18n:extract`

Translate the new messages as:

```text
페디버스에서 Atom 피드를 팔로우하세요.
페디버스에서 어떤 Atom 피드든 팔로우하세요
rss2.pub은 Atom 피드를 누구나 팔로우할 수 있는 페디버스 계정으로 바꿉니다.
웹사이트가 아니라 Atom 피드 자체의 주소를 입력하세요. 보통 /atom 또는 .xml로 끝납니다.
해당 주소에서 Atom 피드를 읽을 수 없습니다: {message}
```

Run: `yarn i18n:compile`

- [ ] **Step 3: Update repository guidance without claiming raw Fedify is implemented**

In `README.md` and `AGENTS.md`, state that input is Atom-only and that M6 still uses BotKit pending
ADR-0013. Remove RSS parser commands/gotchas, retain the BotKit runtime notes until M7 deletes the
dependency, and link ADR-0012.

- [ ] **Step 4: Verify catalogs and UI tests**

Run: `git add src/web/locales && yarn i18n:extract && yarn i18n:compile && git diff --exit-code -- src/web/locales`

Run: `yarn test:unit test/unit/web/i18n.test.ts test/unit/web/routes.test.ts`

Expected: both commands exit 0.

- [ ] **Step 5: Commit Atom-only copy**

```bash
git add README.md AGENTS.md src/application/handle-command.ts src/infrastructure/federation/botkit-stack.ts src/web test/unit/application/handle-command.test.ts test/unit/web
git commit -m "docs: describe Atom-only feed input" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 7: Finish workspace packaging, remove dependencies, and refresh Nix hashes

**Files:**
- Modify: `package.json`
- Modify: `yarn.lock`
- Modify: `flake.nix`
- Modify: `nix/missing-hashes.json`
- Modify: `Containerfile`

**Interfaces:**
- Root `yarn build` emits both `packages/atom-feed/dist` and root `dist`.
- Runtime images contain the workspace package directory that the Yarn workspace symlink targets.

- [ ] **Step 1: Remove `rss-parser` and update package descriptions**

Run: `yarn remove rss-parser`

Keep `linkedom`; Readability still uses it. Change descriptions from `RSS/Atom` to `Atom` in
`package.json`, `flake.nix`, and Container labels.

- [ ] **Step 2: Include workspace files in Nix and Container builds**

Add `./packages` to the Nix source fileset and copy `packages` into `$out/lib/rss2pub/`. In the
Container build, copy `packages/atom-feed/package.json` before `yarn install`, copy package source in
the build stage, and copy the built `packages/atom-feed` directory into the runtime image. Preserve
the root entry point `dist/web/main.js`.

- [ ] **Step 3: Prove the ordinary TypeScript build resolves the workspace package**

Run: `yarn build`

Expected: root `dist/web/main.js` and `packages/atom-feed/dist/index.js` both exist.

- [ ] **Step 4: Refresh Nix lock-derived files**

Run:

```bash
nix run nixpkgs#yarn-berry_4-fetcher.yarn-berry-fetcher -- missing-hashes yarn.lock > nix/missing-hashes.json
nix run nixpkgs#yarn-berry_4-fetcher.yarn-berry-fetcher -- prefetch yarn.lock nix/missing-hashes.json
```

Copy the reported `sha256-...` value into `flake.nix` as `yarnOfflineCache.hash`.

- [ ] **Step 5: Run the complete quality gate and Nix package**

Run: `yarn typecheck && yarn test && nix build .#`

Expected: every command exits 0 and `./result/bin/rss2pub` exists.

- [ ] **Step 6: Verify generated catalogs and repository cleanliness**

Run: `yarn i18n:extract && yarn i18n:compile && git diff --exit-code -- src/web/locales`

Expected: no generated-file drift. If `result` is an untracked symlink, leave it ignored; do not add it.

- [ ] **Step 7: Commit packaging and dependency cleanup**

```bash
git add package.json yarn.lock flake.nix nix/missing-hashes.json Containerfile packages/atom-feed/package.json
git commit -m "build: package the Atom parser workspace" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 8: Milestone review and acceptance evidence

**Files:**
- Modify only if verification exposes a defect in an M6 file.

**Interfaces:**
- Produces: a green Atom-only milestone with BotKit intentionally still present.

- [ ] **Step 1: Run format-support and dependency searches**

Run: `rg -n "rss-parser|createRssParserFetcher|rssFixture" src test packages package.json`

Expected: no matches.

Run: `rg -n "RSS/Atom|RSS or Atom|RSS feed" src README.md AGENTS.md package.json flake.nix Containerfile`

Expected: no product-support claims; historical comments must be removed or explicitly marked historical.

- [ ] **Step 2: Run final verification from a clean install state**

Run: `yarn install --immutable && yarn typecheck && yarn test && yarn build && nix build .#`

Expected: all commands exit 0.

- [ ] **Step 3: Inspect the milestone diff**

Run: `git diff HEAD~7 --stat && git status --short`

Expected: only M6 files changed and the worktree is clean. Do not create an empty acceptance commit.
