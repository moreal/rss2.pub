# W3C Atom Consumer Conformance Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin the W3C Feed Validator Atom corpus as a Git submodule and make every selected RFC 4287 fixture explicitly execute or receive a reviewed not-applicable classification in the offline rss2.pub consumer conformance suite.

**Architecture:** A shallow Git submodule at `vendor/w3c-feedvalidator` supplies the unmodified upstream corpus and license at a fixed commit. Root developer tooling generates a typed, checksum-bearing 381-row manifest; package test helpers execute parser-boundary, accepted-document, and DTO-projection cases without adding Node dependencies to production parser code.

**Tech Stack:** Git submodules, Node.js 24, TypeScript NodeNext, Vitest 4, `node:fs`/`node:crypto` test tooling, Yarn Berry, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-08-31-w3c-atom-consumer-conformance-design.md`

## Global Constraints

- Normative format behavior comes from RFC 4287; the W3C Feed Validator corpus is a cited regression oracle, not a normative certification.
- Use `https://github.com/w3c/feedvalidator.git` at exact commit `9ce274c9db93796b8ab2a44952b9da80811bf765`.
- The submodule path is exactly `vendor/w3c-feedvalidator`; `.gitmodules` uses HTTPS and `shallow = true`.
- Select exactly the 381 XML files matching `testcases/atom/[0-9]*/**/*.xml`; exclude legacy `must`/`should` and web presentation files.
- Preserve the upstream repository and `LICENSE` unmodified; root-owned documentation records attribution, pin, and selection rules.
- All 381 selected files have exactly one generated manifest row with path, RFC section, upstream expectation, SHA-256, classification, reason, and boundary error when applicable.
- All 62 `Expect: !Error` Atom Feed Documents are `accept` or `project`; the two `!Error` Atom Entry Documents are `reject` with `NotAtomFeed`.
- `accept`, `reject`, and `project` execute with zero skips, todos, xfails, or expected-failure wrappers.
- `not-applicable` rows use only the five reason enums approved by the spec; there is no free-form exclusion text.
- The test runner gives an actionable `git submodule update --init --depth 1 vendor/w3c-feedvalidator` error when the submodule is absent.
- Tests and scripts may use Node built-ins; `packages/atom-feed/src` remains pure and must not import Node, HTTP, Fedify, Hono, database, or root `src` modules.
- The submodule is test input only and is not added to Nix or Container runtime outputs.
- CI initializes submodules at checkout and does not call GitHub or the public W3C validator during tests.
- No `any`, type-silencing casts, or non-null assertions; all relative ESM imports end in `.js`.
- Every commit contains exactly one `Assisted-by: Codex:gpt-5.6-sol` trailer.
- Completion requires `yarn typecheck && yarn test && yarn build && nix build .#` on an initialized submodule.

## File Structure

### Create

- `.gitmodules` — W3C submodule URL, path, and shallow policy.
- `vendor/w3c-feedvalidator` — Git gitlink pinned to the reviewed upstream commit.
- `packages/atom-feed/test/conformance/w3c-feedvalidator-support.ts` — test-only corpus location, initialization guard, path enumeration, fixture reading, and commit inspection.
- `packages/atom-feed/test/conformance/w3c-feedvalidator-types.ts` — manifest classifications, reasons, boundary-error, and row types.
- `packages/atom-feed/test/conformance/w3c-feedvalidator-cases.ts` — generated 381-row typed manifest.
- `packages/atom-feed/test/conformance/w3c-feedvalidator.test.ts` — snapshot, manifest, accept, and reject gates.
- `packages/atom-feed/test/conformance/w3c-feedvalidator-projection.test.ts` — exact DTO assertions for selected upstream cases.
- `packages/atom-feed/test/conformance/W3C-FEEDVALIDATOR.md` — attribution, license pointer, pin, scope, and update instructions.
- `scripts/update-w3c-atom-manifest.mjs` — deterministic manifest/checksum generator.
- `packages/atom-feed/README.md` — package scope and conformance claim.

### Modify

- `.github/workflows/ci.yml` — initialize the submodule during checkout.
- `package.json` — add the pinned manifest-generation command.
- `README.md` — cite RFC 4287 and the W3C-derived consumer profile.
- `AGENTS.md` — document submodule setup, update rules, and no-full-validator claim.
- `packages/atom-feed/src/atom.ts` — reject XHTML descendants outside the XHTML namespace.
- `packages/atom-feed/test/atom.test.ts` — local regression for descendant namespace validation.

No dependency or lockfile change is expected.

---

### Task 1: Pin the W3C repository and make corpus availability explicit

**Files:**
- Create: `.gitmodules`
- Create: gitlink `vendor/w3c-feedvalidator`
- Create: `packages/atom-feed/test/conformance/w3c-feedvalidator-support.ts`
- Create: `packages/atom-feed/test/conformance/w3c-feedvalidator.test.ts`
- Create: `packages/atom-feed/test/conformance/W3C-FEEDVALIDATOR.md`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `W3C_FEEDVALIDATOR_COMMIT: string`.
- Produces: `W3C_FEEDVALIDATOR_ROOT: string`.
- Produces: `assertW3cSubmoduleInitialized(): void`.
- Produces: `actualW3cFeedValidatorCommit(): string`.
- Produces: `listSelectedW3cAtomPaths(): readonly string[]`.
- Produces: `readW3cAtomFixtureBytes(relativePath: string): Uint8Array`.
- Produces: `readW3cAtomFixture(relativePath: string): string`.

- [ ] **Step 1: Write the missing-submodule and snapshot smoke tests first**

Create `w3c-feedvalidator.test.ts` with the initial test:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  actualW3cFeedValidatorCommit,
  assertW3cSubmoduleInitialized,
  listSelectedW3cAtomPaths,
  W3C_FEEDVALIDATOR_COMMIT,
  W3C_FEEDVALIDATOR_ROOT,
} from "./w3c-feedvalidator-support.js";

describe("W3C Feed Validator Atom corpus", () => {
  it("uses the initialized, licensed, pinned upstream snapshot", () => {
    assertW3cSubmoduleInitialized();
    expect(actualW3cFeedValidatorCommit()).toBe(W3C_FEEDVALIDATOR_COMMIT);
    expect(readFileSync(join(W3C_FEEDVALIDATOR_ROOT, "LICENSE"), "utf8"))
      .toContain("Permission is hereby granted, free of charge");
    expect(listSelectedW3cAtomPaths()).toHaveLength(381);
  });
});
```

- [ ] **Step 2: Run the smoke test and verify RED**

Run: `yarn vitest run packages/atom-feed/test/conformance/w3c-feedvalidator.test.ts`

Expected: FAIL because `w3c-feedvalidator-support.js` does not exist.

- [ ] **Step 3: Add and pin the shallow submodule**

Run:

```sh
git submodule add --depth 1 https://github.com/w3c/feedvalidator.git vendor/w3c-feedvalidator
git -C vendor/w3c-feedvalidator fetch --depth 1 origin 9ce274c9db93796b8ab2a44952b9da80811bf765
git -C vendor/w3c-feedvalidator checkout --detach 9ce274c9db93796b8ab2a44952b9da80811bf765
git config -f .gitmodules submodule.vendor/w3c-feedvalidator.shallow true
```

Inspect `git submodule status --cached vendor/w3c-feedvalidator`; it must begin with
`9ce274c9db93796b8ab2a44952b9da80811bf765`.

- [ ] **Step 4: Implement the test-only support module**

Use these constants and functions:

```ts
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const W3C_FEEDVALIDATOR_COMMIT =
  "9ce274c9db93796b8ab2a44952b9da80811bf765";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
export const W3C_FEEDVALIDATOR_ROOT = join(
  REPOSITORY_ROOT,
  "vendor",
  "w3c-feedvalidator",
);
const ATOM_ROOT = join(W3C_FEEDVALIDATOR_ROOT, "testcases", "atom");
const INITIALIZE_COMMAND =
  "git submodule update --init --depth 1 vendor/w3c-feedvalidator";
let selectedPaths: readonly string[] | null = null;

export function assertW3cSubmoduleInitialized(): void {
  if (!existsSync(join(W3C_FEEDVALIDATOR_ROOT, "LICENSE"))) {
    throw new Error(`W3C Feed Validator submodule is missing; run: ${INITIALIZE_COMMAND}`);
  }
}

export function actualW3cFeedValidatorCommit(): string {
  assertW3cSubmoduleInitialized();
  return execFileSync("git", ["-C", W3C_FEEDVALIDATOR_ROOT, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

export function listSelectedW3cAtomPaths(): readonly string[] {
  assertW3cSubmoduleInitialized();
  if (selectedPaths !== null) return selectedPaths;
  const discovered = walk(ATOM_ROOT)
    .map((path) => relative(ATOM_ROOT, path).split(sep).join("/"))
    .filter((path) => /^[0-9][^/]*\/.+\.xml$/u.test(path))
    .sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
  selectedPaths = discovered;
  return discovered;
}

export function readW3cAtomFixture(relativePath: string): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(
    readW3cAtomFixtureBytes(relativePath),
  );
}

export function readW3cAtomFixtureBytes(relativePath: string): Uint8Array {
  assertW3cSubmoduleInitialized();
  if (!listSelectedW3cAtomPaths().includes(relativePath)) {
    throw new Error(`Unknown selected W3C Atom fixture: ${relativePath}`);
  }
  return readFileSync(join(ATOM_ROOT, relativePath));
}
```

Do not export this module from `packages/atom-feed/src/index.ts`.

- [ ] **Step 5: Add attribution and CI initialization**

Write `W3C-FEEDVALIDATOR.md` with the repository URL, exact commit, selected glob, count 381,
license path `vendor/w3c-feedvalidator/LICENSE`, and the statement that the W3C project does not
endorse rss2.pub.

Change the CI checkout step to:

```yaml
- uses: actions/checkout@v4
  with:
    submodules: true
```

Do not initialize the submodule in publish or Nix-package jobs; neither runs conformance tests or
copies `vendor/` into runtime output.

- [ ] **Step 6: Run the smoke test and package typecheck**

Run: `yarn vitest run packages/atom-feed/test/conformance/w3c-feedvalidator.test.ts && yarn workspace @rss2pub/atom-feed typecheck`

Expected: PASS; one test, commit pin, license, and 381 paths agree.

- [ ] **Step 7: Commit the pinned corpus boundary**

```sh
git add .gitmodules vendor/w3c-feedvalidator .github/workflows/ci.yml packages/atom-feed/test/conformance
git commit -m "test(atom): pin the W3C Feed Validator corpus" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 2: Generate an exhaustive typed manifest with checksums

**Files:**
- Create: `packages/atom-feed/test/conformance/w3c-feedvalidator-types.ts`
- Create: generated `packages/atom-feed/test/conformance/w3c-feedvalidator-cases.ts`
- Create: `scripts/update-w3c-atom-manifest.mjs`
- Modify: `packages/atom-feed/test/conformance/w3c-feedvalidator.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `W3cAtomClassification`, `W3cAtomCaseReason`, `W3cAtomBoundaryError`, `W3cAtomRootKind`, and `W3cAtomCase`.
- Produces: `W3C_ATOM_CASES: readonly W3cAtomCase[]`.
- Adds command: `yarn atom:conformance:update`.

- [ ] **Step 1: Add failing manifest-coverage assertions**

Extend the smoke test:

```ts
import { createHash } from "node:crypto";
import { W3C_ATOM_CASES } from "./w3c-feedvalidator-cases.js";
import { readW3cAtomFixtureBytes } from "./w3c-feedvalidator-support.js";

it("accounts for every selected fixture exactly once", () => {
  const selected = listSelectedW3cAtomPaths();
  expect(W3C_ATOM_CASES.map((testCase) => testCase.path)).toEqual(selected);
  expect(new Set(W3C_ATOM_CASES.map((testCase) => testCase.path)).size).toBe(381);

  for (const testCase of W3C_ATOM_CASES) {
    expect(createHash("sha256").update(readW3cAtomFixtureBytes(testCase.path)).digest("hex"),
      testCase.path).toBe(testCase.sha256);
  }
});

it("classifies the upstream no-error documents without exclusions", () => {
  const noError = W3C_ATOM_CASES.filter(
    (testCase) => testCase.upstreamExpectation === "!Error",
  );
  expect(noError).toHaveLength(64);
  expect(noError.filter((testCase) => testCase.rootKind === "feed")).toHaveLength(62);
  expect(noError.filter((testCase) => testCase.rootKind === "entry")).toHaveLength(2);
  expect(noError.filter((testCase) => testCase.rootKind === "feed")
    .every((testCase) => testCase.classification === "accept"
      || testCase.classification === "project")).toBe(true);
  expect(noError.filter((testCase) => testCase.rootKind === "entry")
    .every((testCase) => testCase.classification === "reject"
      && testCase.expectedError === "NotAtomFeed")).toBe(true);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `yarn vitest run packages/atom-feed/test/conformance/w3c-feedvalidator.test.ts`

Expected: FAIL because `w3c-feedvalidator-cases.js` does not exist.

- [ ] **Step 3: Define the manifest types**

```ts
export type W3cAtomClassification = "accept" | "reject" | "project" | "not-applicable";
export type W3cAtomRootKind = "feed" | "entry" | "other";
export type W3cAtomBoundaryError = "MalformedXml" | "NotAtomFeed" | "UnsafeXml";
export type W3cAtomCaseReason =
  | "upstream-no-error-feed"
  | "product-rejects-entry-document"
  | "parser-boundary"
  | "dto-projection"
  | "unconsumed-element"
  | "validator-only-semantic-rule"
  | "extension-or-security-warning"
  | "requires-document-uri-resolution";

export type W3cAtomCase = {
  readonly path: string;
  readonly rfcSection: string;
  readonly upstreamExpectation: string;
  readonly sha256: string;
  readonly rootKind: W3cAtomRootKind;
  readonly classification: W3cAtomClassification;
  readonly reason: W3cAtomCaseReason;
  readonly expectedError?: W3cAtomBoundaryError;
};
```

- [ ] **Step 4: Implement exact classification rules in the generator**

The generator accepts exactly two positional arguments: submodule path and full commit. Exit 2 for
wrong arguments, a missing license, the wrong HEAD, a missing `Expect:` comment, a non-381 selection,
or an unclassifiable root.

Use these exact project cases:

```js
const PROJECT_PATHS = new Set([
  "1.1/brief-noerror.xml",
  "1.1/extensive-noerror.xml",
  "1.2/prefixed-namespace.xml",
  "2/infoset-cdata.xml",
  "2/infoset-char-ref.xml",
  "2/xml-lang.xml",
  "2/xml-lang-blank.xml",
  "3.1.1.1/example_text_title.xml",
  "3.1.1.2/example_html_title.xml",
  "3.1.1.3/example_xhtml_summary2.xml",
  "3.1.1.3/example_xhtml_summary3.xml",
  "3.1.1.3/missing_xhtml_div.xml",
  "3.1.1.3/missing_xhtml_ns.xml",
  "3.1.1.3/wrong_namespace_for_xhtml_div.xml",
  "3.3/published_fractional_second.xml",
  "4.1.1/author-at-feed-and-entry.xml",
  "4.1.1/author-at-feed-only.xml",
  "4.1.3.2/content-src-no-type-no-error.xml",
  "4.2.11/multiple-authors.xml",
]);

const BOUNDARY_ERRORS = new Map([
  ["1.2/missing-namespace.xml", "NotAtomFeed"],
  ["1.2/wrong-namespace-case.xml", "NotAtomFeed"],
  ["1.2/wrong-namespace.xml", "NotAtomFeed"],
  ["2/brief-entry-noerror.xml", "NotAtomFeed"],
  ["3.1.1.3/xhtml_named_entity.xml", "MalformedXml"],
  ["6.1/invalid-namespace.xml", "MalformedXml"],
]);
```

Treat every `4.1.2/*.xml` path as an Atom Entry Document boundary with `NotAtomFeed`. Determine root
kind by removing XML comments and matching the first qualified or unqualified `feed`/`entry` start
tag; the updater is analyzing a fixed trusted test corpus, not parsing production input.

Classify in this order:

```js
function classify({ path, expectation, rootKind }) {
  if (PROJECT_PATHS.has(path)) {
    return { classification: "project", reason: "dto-projection" };
  }
  if (path.startsWith("4.1.2/") || rootKind === "entry") {
    return {
      classification: "reject",
      reason: "product-rejects-entry-document",
      expectedError: "NotAtomFeed",
    };
  }
  const boundaryError = BOUNDARY_ERRORS.get(path);
  if (boundaryError !== undefined) {
    return {
      classification: "reject",
      reason: "parser-boundary",
      expectedError: boundaryError,
    };
  }
  if (expectation === "!Error" && rootKind === "feed") {
    return { classification: "accept", reason: "upstream-no-error-feed" };
  }
  return {
    classification: "not-applicable",
    reason: notApplicableReason(path),
  };
}
```

`notApplicableReason()` uses these ordered rules, with the final branch explicit rather than a
free-form string:

```js
function notApplicableReason(path) {
  if (/^(?:6\.1|6\.4|8\.1|8\.2)\//u.test(path)) {
    return "extension-or-security-warning";
  }
  if (/^(?:4\.2\.2|4\.2\.4|4\.2\.5|4\.2\.8|4\.2\.10|4\.2\.11)\//u.test(path)) {
    return "unconsumed-element";
  }
  if (path.includes("xml-base")
    || /^(?:4\.2\.7\.1\/link-href-relative|4\.2\.7\.2\/link-rel-self)/u.test(path)) {
    return "requires-document-uri-resolution";
  }
  return "validator-only-semantic-rule";
}
```

Extract `Expect:` with `/Expect:\s*([^\r\n]+)/u`, compute lower-case SHA-256 hex over raw fixture
bytes, sort paths bytewise, and write the generated TypeScript with:

```js
const generated = [
  "// Generated by scripts/update-w3c-atom-manifest.mjs; do not edit.",
  'import type { W3cAtomCase } from "./w3c-feedvalidator-types.js";',
  "",
  `export const W3C_ATOM_CASES = ${JSON.stringify(cases, null, 2)} as const satisfies readonly W3cAtomCase[];`,
  "",
].join("\n");

writeFileSync(outputPath, generated);
```

- [ ] **Step 5: Add the pinned update command and generate the manifest**

Add to root `package.json`:

```json
"atom:conformance:update": "node scripts/update-w3c-atom-manifest.mjs vendor/w3c-feedvalidator 9ce274c9db93796b8ab2a44952b9da80811bf765"
```

Run: `yarn atom:conformance:update`

Inspect that the generated array has 381 rows and no path below `must/` or `should/`.

- [ ] **Step 6: Run integrity tests and prove generator idempotence**

Run:

```sh
git add packages/atom-feed/test/conformance/w3c-feedvalidator-cases.ts
yarn atom:conformance:update
git diff --exit-code -- packages/atom-feed/test/conformance/w3c-feedvalidator-cases.ts
yarn vitest run packages/atom-feed/test/conformance/w3c-feedvalidator.test.ts
yarn typecheck
```

Expected: no generated diff; two conformance tests PASS; typecheck exits 0.

- [ ] **Step 7: Commit manifest generation**

```sh
git add package.json scripts/update-w3c-atom-manifest.mjs packages/atom-feed/test/conformance
git commit -m "test(atom): classify the W3C Atom corpus" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 3: Execute every accepted feed and parser-boundary rejection

**Files:**
- Create: `packages/atom-feed/test/conformance/w3c-feedvalidator-runner.ts`
- Modify: `packages/atom-feed/test/conformance/w3c-feedvalidator.test.ts`

**Interfaces:**
- Consumes: `W3C_ATOM_CASES`, `readW3cAtomFixture`, and public `parseAtom`.
- Produces: `parseW3cAtomCase(testCase: W3cAtomCase): AtomParseResult` for conformance tests only.

- [ ] **Step 1: Add parameterized accept/reject tests before the runner**

```ts
import { parseW3cAtomCase } from "./w3c-feedvalidator-runner.js";

const accepted = W3C_ATOM_CASES.filter((testCase) => testCase.classification === "accept");
const rejected = W3C_ATOM_CASES.filter((testCase) => testCase.classification === "reject");

it.each(accepted)("accepts RFC $rfcSection $path", (testCase) => {
  expect(parseW3cAtomCase(testCase), testCase.path).toMatchObject({ ok: true });
});

it.each(rejected)("rejects RFC $rfcSection $path as $expectedError", (testCase) => {
  expect(parseW3cAtomCase(testCase), testCase.path).toMatchObject({
    ok: false,
    error: { type: testCase.expectedError },
  });
});
```

- [ ] **Step 2: Run and verify RED**

Run: `yarn vitest run packages/atom-feed/test/conformance/w3c-feedvalidator.test.ts`

Expected: FAIL because `w3c-feedvalidator-runner.js` does not exist.

- [ ] **Step 3: Implement the minimal runner**

```ts
import { parseAtom, type AtomParseResult } from "../../src/index.js";
import type { W3cAtomCase } from "./w3c-feedvalidator-types.js";
import { readW3cAtomFixture } from "./w3c-feedvalidator-support.js";

export function parseW3cAtomCase(testCase: W3cAtomCase): AtomParseResult {
  return parseAtom(readW3cAtomFixture(testCase.path));
}
```

- [ ] **Step 4: Run the corpus gate**

Run: `yarn vitest run packages/atom-feed/test/conformance/w3c-feedvalidator.test.ts`

Expected: all integrity, accepted-feed, and rejected-boundary cases PASS. The pre-plan probe already
confirmed all 62 upstream `!Error` Atom Feed Documents parse successfully; a failure here indicates
manifest or harness drift, not an invitation to weaken classification.

- [ ] **Step 5: Run all package tests and typecheck**

Run: `yarn vitest run packages/atom-feed/test && yarn workspace @rss2pub/atom-feed typecheck`

Expected: existing parser tests and the new corpus gate PASS.

- [ ] **Step 6: Commit executable accept/reject coverage**

```sh
git add packages/atom-feed/test/conformance
git commit -m "test(atom): execute W3C accept and reject cases" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 4: Assert W3C DTO projection semantics

**Files:**
- Create: `packages/atom-feed/test/conformance/w3c-feedvalidator-projection.test.ts`
- Modify: `packages/atom-feed/src/atom.ts`
- Modify: `packages/atom-feed/test/atom.test.ts`

**Interfaces:**
- Consumes: `parseW3cAtomCase`, `W3C_ATOM_CASES`, and `AtomFeedDto`.
- Produces: direct DTO assertions for every manifest row classified `project`.

- [ ] **Step 1: Write the projection helper and the failing XHTML namespace assertion first**

In the new test file, define:

```ts
function projected(path: string) {
  const testCase = W3C_ATOM_CASES.find((candidate) => candidate.path === path);
  if (testCase === undefined || testCase.classification !== "project") {
    throw new Error(`Missing project manifest row: ${path}`);
  }
  const result = parseW3cAtomCase(testCase);
  if (!result.ok) throw new Error(`${path}: ${result.error.type}`);
  return result.value;
}
```

Add this regression before the other projection assertions:

```ts
it("rejects XHTML descendants that leave the XHTML namespace", () => {
  expect(projected("3.1.1.3/missing_xhtml_ns.xml").entries[0]?.summary).toBeNull();
});
```

- [ ] **Step 2: Run the namespace assertion and verify RED**

Run: `yarn vitest run packages/atom-feed/test/conformance/w3c-feedvalidator-projection.test.ts -t "leave the XHTML namespace"`

Expected: FAIL because the current parser validates the XHTML `div` namespace but serializes its
no-namespace `<b xmlns="">` descendant instead of rejecting the construct.

- [ ] **Step 3: Apply the minimal XHTML descendant namespace correction**

Add a recursive predicate in `packages/atom-feed/src/atom.ts`:

```ts
function hasNonXhtmlDescendant(element: XmlElement): boolean {
  return element.children.some((child) => child.type === "element"
    && (child.namespace !== XHTML_NAMESPACE || hasNonXhtmlDescendant(child)));
}
```

Change the XHTML guard to return `null` when `hasNonXhtmlDescendant(div)` is true. Add the same
fixture shape to `packages/atom-feed/test/atom.test.ts` so the production rule is independently
pinned without the submodule.

Run the local and W3C focused cases:

```sh
yarn vitest run packages/atom-feed/test/atom.test.ts -t "XHTML namespace"
yarn vitest run packages/atom-feed/test/conformance/w3c-feedvalidator-projection.test.ts -t "leave the XHTML namespace"
```

Expected: both PASS.

- [ ] **Step 4: Add the remaining exact upstream projection assertions**

Keep the namespace regression and add these behaviors:

```ts
it("projects the W3C extensive feed", () => {
  expect(projected("1.1/extensive-noerror.xml")).toMatchObject({
    id: "tag:example.org,2003:3",
    title: { type: "text", value: "dive into mark", plainText: "dive into mark" },
    subtitle: { type: "html", plainText: expect.stringContaining("A lot of effort") },
    link: "http://example.org/",
    entries: [{
      id: "tag:example.org,2003:3.2397",
      link: "http://example.org/2005/04/02/atom",
      published: "2003-12-13T08:29:29-04:00",
      authors: [{
        name: "Mark Pilgrim",
        uri: "http://example.org/",
        email: "f8dy@example.com",
      }],
      content: {
        type: "xhtml",
        value: "<p><i>[Update: The Atom draft is finished.]</i></p>",
      },
    }],
  });
});

it("decodes XML infoset text consistently", () => {
  expect(projected("2/infoset-cdata.xml").entries[0]?.summary?.value)
    .toBe("Some <b>bold</b> text.");
  expect(projected("2/infoset-char-ref.xml").entries[0]?.updated)
    .toBe("2003-12-13T18:30:02Z");
});

it("projects text, HTML, and prefixed XHTML constructs", () => {
  expect(projected("3.1.1.1/example_text_title.xml").title?.type).toBe("text");
  expect(projected("3.1.1.2/example_html_title.xml").title?.type).toBe("html");
  expect(projected("3.1.1.3/example_xhtml_summary2.xml").entries[0]?.summary)
    .toMatchObject({ type: "xhtml", value: expect.stringContaining("<b>XHTML</b>") });
  expect(projected("3.1.1.3/example_xhtml_summary3.xml").entries[0]?.summary)
    .toMatchObject({ type: "xhtml", value: expect.stringContaining("<b>XHTML</b>") });
});

it("returns null for invalid XHTML wrappers", () => {
  for (const path of [
    "3.1.1.3/missing_xhtml_div.xml",
    "3.1.1.3/wrong_namespace_for_xhtml_div.xml",
  ]) {
    expect(projected(path).entries[0]?.summary, path).toBeNull();
  }
});

it("honors Atom language and external-content rules", () => {
  expect(projected("2/xml-lang.xml").language).toBe("en-us");
  expect(projected("2/xml-lang-blank.xml").language).toBeNull();
  expect(projected("4.1.3.2/content-src-no-type-no-error.xml").entries[0]?.content)
    .toBeNull();
});

it("applies entry, source, and feed author precedence", () => {
  expect(projected("4.1.1/author-at-feed-and-entry.xml").entries[0]?.authors)
    .toEqual([{ name: "Jane Doe", uri: null, email: null }]);
  expect(projected("4.1.1/author-at-feed-only.xml").entries[0]?.authors)
    .toEqual([{ name: "John Doe", uri: null, email: null }]);
  expect(projected("4.2.11/multiple-authors.xml").entries[0]?.authors)
    .toEqual([
      { name: "John Doe", uri: null, email: null },
      { name: "Jane Doe", uri: null, email: null },
    ]);
});

it("preserves RFC 3339 source strings", () => {
  const entry = projected("3.3/published_fractional_second.xml").entries[0];
  expect(entry?.published).toBe("2002-12-31T19:20:30.45+01:00");
  expect(entry?.updated).toBe("2003-12-13T18:30:02Z");
});
```

Also assert `1.1/brief-noerror.xml` selects the omitted-`rel` feed link
`http://example.org/`, and `1.2/prefixed-namespace.xml` parses successfully.

- [ ] **Step 5: Run all conformance and package tests**

Run:

```sh
yarn vitest run packages/atom-feed/test/conformance
yarn vitest run packages/atom-feed/test
yarn workspace @rss2pub/atom-feed typecheck
```

Expected: every project row is asserted, all package tests PASS, typecheck exits 0.

- [ ] **Step 6: Verify every project row is consumed exactly once**

Add a final assertion collecting the paths named by the projection tests and comparing them with:

```ts
W3C_ATOM_CASES
  .filter((testCase) => testCase.classification === "project")
  .map((testCase) => testCase.path)
  .sort()
```

Expected: exact equality; no project row exists without a DTO assertion.

- [ ] **Step 7: Commit projection conformance**

```sh
git add packages/atom-feed/src/atom.ts packages/atom-feed/test
git commit -m "test(atom): assert W3C projection semantics" -m "Assisted-by: Codex:gpt-5.6-sol"
```

If `atom.ts` did not change, omit it from `git add`; do not create an artificial production diff.

### Task 5: Document the profile and run repository acceptance

**Files:**
- Create: `packages/atom-feed/README.md`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `packages/atom-feed/test/conformance/W3C-FEEDVALIDATOR.md`

**Interfaces:**
- User-facing claim: `Tested against the rss2.pub Atom consumer conformance profile derived from the W3C Feed Validator RFC 4287 corpus.`
- Setup command: `git submodule update --init --depth 1 vendor/w3c-feedvalidator`.

- [ ] **Step 1: Add documentation assertions before changing docs**

Extend `w3c-feedvalidator.test.ts`:

```ts
it("keeps the conformance claim scoped and attributed", () => {
  const packageReadme = readFileSync(
    new URL("../../README.md", import.meta.url),
    "utf8",
  );
  const profile = readFileSync(
    new URL("./W3C-FEEDVALIDATOR.md", import.meta.url),
    "utf8",
  );
  expect(packageReadme).toContain(
    "Tested against the rss2.pub Atom consumer conformance profile derived from the W3C Feed Validator RFC 4287 corpus.",
  );
  expect(profile).toContain("9ce274c9db93796b8ab2a44952b9da80811bf765");
  expect(profile).toContain("vendor/w3c-feedvalidator/LICENSE");
  expect(profile).toContain("consumer conformance profile");
  expect(profile).not.toContain("W3C certified");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `yarn vitest run packages/atom-feed/test/conformance/w3c-feedvalidator.test.ts -t "scoped and attributed"`

Expected: FAIL with `ENOENT` because `packages/atom-feed/README.md` does not exist yet.

- [ ] **Step 3: Write package and repository guidance**

Document:

- RFC 4287 is normative.
- The W3C Feed Validator corpus is the pinned regression oracle.
- The profile covers all 381 selected paths but does not claim full Feed Validator parity or W3C
  endorsement.
- 62 no-error Atom Feed Documents execute as accepted/projected inputs; standalone entries are
  rejected by product policy.
- clone/setup requires the exact submodule initialization command.
- updating the pin requires moving the gitlink, running `yarn atom:conformance:update`, reviewing
  classifications/checksums, and running the complete gate.

Use the exact approved claim from the Interfaces block in root and package README.

- [ ] **Step 4: Run manifest and generated-file idempotence checks**

```sh
git add packages/atom-feed/test/conformance/w3c-feedvalidator-cases.ts
yarn atom:conformance:update
git diff --exit-code -- packages/atom-feed/test/conformance/w3c-feedvalidator-cases.ts
git submodule status --cached vendor/w3c-feedvalidator
```

Expected: no generated diff; submodule status names the exact pin without a leading `+` or `-`.

- [ ] **Step 5: Prove there are no conformance skips or unaccounted fixtures**

Run:

```sh
rg -n "describe\.skip|it\.skip|test\.skip|\.todo\(|xfail|expected failure" packages/atom-feed/test/conformance
```

Expected: no matches.

Run the focused suite:

```sh
yarn vitest run packages/atom-feed/test/conformance
```

Expected: snapshot integrity, all accepted/rejected cases, and every projection assertion PASS.

- [ ] **Step 6: Run the complete repository gate**

Run:

```sh
yarn install --immutable
yarn typecheck
yarn test
yarn build
nix build .#
```

Expected: all commands exit 0. `yarn test` includes the conformance corpus through the existing unit
project. `nix build` does not copy or require `vendor/` because package build excludes tests.

- [ ] **Step 7: Commit documentation and final safeguards**

```sh
git add README.md AGENTS.md packages/atom-feed/README.md packages/atom-feed/test/conformance/W3C-FEEDVALIDATOR.md packages/atom-feed/test/conformance/w3c-feedvalidator.test.ts
git commit -m "docs: cite the W3C Atom conformance profile" -m "Assisted-by: Codex:gpt-5.6-sol"
```

### Task 6: Final review and acceptance evidence

**Files:**
- Modify only if verification exposes a defect in the conformance profile.

**Interfaces:**
- Produces: a pinned, cited, offline-after-checkout W3C Atom consumer conformance profile on PR #2.

- [ ] **Step 1: Audit submodule and manifest state**

Run:

```sh
git submodule status --cached vendor/w3c-feedvalidator
yarn atom:conformance:update
git diff --exit-code -- packages/atom-feed/test/conformance/w3c-feedvalidator-cases.ts
```

Expected: exact pin, no manifest drift.

- [ ] **Step 2: Audit corpus counts and classifications**

Run the integrity tests with verbose reporting:

```sh
yarn vitest run packages/atom-feed/test/conformance/w3c-feedvalidator.test.ts --reporter=verbose
```

Expected: 381 paths covered, 64 `!Error` documents identified, 62 no-error feeds executable, two
no-error entry documents rejected, and no duplicate path.

- [ ] **Step 3: Run final quality gates from the initialized worktree**

Run:

```sh
yarn typecheck
yarn test
yarn build
nix build .#
git -c core.fsmonitor=false diff --check
git -c core.fsmonitor=false status --short
```

Expected: every code/build/test command exits 0 and tracked worktree status is clean. Do not create
an empty acceptance commit.
