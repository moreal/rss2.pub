# W3C Atom Consumer Conformance Profile Design

- Status: approved in principle (2026-08-31); awaiting written-spec review
- Product milestone: M6 Atom-only feed foundation
- Normative format: RFC 4287, The Atom Syndication Format
- Reference corpus: W3C Feed Validator commit `9ce274c9db93796b8ab2a44952b9da80811bf765`

## Goal

Give `@rss2pub/atom-feed` a reproducible, cited standards test layer based on the W3C Feed
Validator corpus. Every upstream Atom case in the selected snapshot must be accounted for, and every
case applicable to rss2.pub's consumer contract must run in CI without network access, skips, xfails,
or silent exclusions.

This profile does not claim that rss2.pub is a complete Atom validator. The W3C Feed Validator
checks every RFC 4287 validity rule, extension vocabulary, warning, and security recommendation.
rss2.pub is an Atom Feed Document consumer that projects a documented subset into feed and entry
DTOs. The profile makes that boundary explicit and testable instead of weakening either claim.

## Upstream and License

Use the W3C-customized Feed Validator repository:

- Repository: `https://github.com/w3c/feedvalidator`
- Snapshot: `9ce274c9db93796b8ab2a44952b9da80811bf765`
- Corpus root: `testcases/atom`
- License file: `LICENSE`

The upstream license permits using, copying, modifying, merging, publishing, distributing,
sublicensing, and selling copies, provided its copyright and permission notice remain with copied
substantial portions. The vendored fixture root therefore includes an unmodified copy of the
upstream `LICENSE` and an `UPSTREAM.md` recording the repository, commit, selection rule, retrieval
date, and local modifications. No W3C logo or claim of W3C endorsement is made.

## Corpus Selection

Vendor every XML fixture below a numbered Atom directory:

```text
testcases/atom/[0-9]*/**/*.xml
```

At the pinned commit this selects 381 files. It includes the RFC 4287 section-oriented suites such
as `3.1.1.3`, `4.1.2`, and `4.2.7.2`.

Do not vendor these paths:

- `testcases/atom/must` and `testcases/atom/should`: legacy pre-1.0 draft cases whose element names
  include `modified`, `issued`, `tagline`, and `info` rather than final RFC 4287 vocabulary.
- directory indexes, `.htaccess`, headers, and footers: Feed Validator web presentation rather than
  conformance input.

The selected file count and each relative path are pinned in the manifest. Adding, removing, or
renaming a vendored file without updating its manifest row fails the suite.

## Consumer Profile

The checked-in manifest has exactly one row per selected upstream fixture:

```ts
type W3cAtomCase = {
  readonly path: string;
  readonly rfcSection: string;
  readonly upstreamExpectation: string;
  readonly classification: "accept" | "reject" | "project" | "not-applicable";
  readonly reason: W3cAtomCaseReason;
};
```

### `accept`

An Atom Feed Document that the upstream case explicitly expects to have no validation `Error` must
return `ok` from `parseAtom()`. W3C warnings do not make a document unparsable. Atom Entry Documents
are exercised under `reject` because rss2.pub registers feeds, not standalone entries.

### `reject`

Use this only when the fixture exercises a boundary already claimed by `parseAtom()`:

- malformed XML;
- a missing, wrong, or case-mismatched Atom namespace on the feed root;
- a non-feed document root, including otherwise valid Atom Entry Documents;
- unsafe XML constructs represented in the selected corpus.

The manifest records the expected `AtomParseError.type`. Semantic validator errors are not silently
promoted to whole-document parser errors.

### `project`

Use this when a fixture covers data that rss2.pub projects. The case must parse and assert the
specific DTO result, not merely `result.ok`:

- direct-child feed and entry metadata;
- text, HTML, and XHTML text constructs;
- XHTML wrapper and child-order behavior;
- alternate link selection, including omitted `rel`;
- `content src` producing no inline content;
- `xml:lang` inheritance and explicit clearing;
- entry, source, and feed author inheritance;
- RFC 3339 source strings preserved for the HTTP adapter.

If an upstream projection case reveals that the existing M6 contract is wrong, first add the
failing conformance assertion, then make the smallest production change needed to satisfy RFC 4287.

### `not-applicable`

Every excluded case remains visible in the manifest with one machine-readable reason:

- `unconsumed-element`: category, contributor, generator, icon, logo, rights, or another field the
  DTO intentionally does not expose;
- `validator-only-semantic-rule`: cardinality, IRI canonicalization, email validation, duplicate
  detection, or another complete-validator responsibility outside `parseAtom()`;
- `extension-or-security-warning`: extension vocabulary, embedded active content, style warning, or
  other Feed Validator advisory handled later by rss2.pub's existing HTML sanitizer;
- `requires-document-uri-resolution`: a rule whose oracle requires the fetched document URI or
  `xml:base`, neither of which belongs to the pure XML-to-DTO package's current interface.

`not-applicable` is not a skip in executable tests. A coverage test verifies its explicit manifest
row and reason. Reclassifying a case requires a reviewed manifest diff.

## Repository Layout

```text
packages/atom-feed/test/conformance/
  w3c-feedvalidator.test.ts
  w3c-feedvalidator-cases.ts
packages/atom-feed/test/fixtures/w3c-feedvalidator/
  LICENSE
  UPSTREAM.md
  testcases/atom/<numbered RFC directories only>
scripts/
  update-w3c-atom-corpus.mjs
```

Production files in `packages/atom-feed/src` remain free of Node built-ins. Test code may use
`node:fs` and `node:path` to enumerate the vendored corpus. The root update script is developer
tooling and is not included in the runtime package output.

## Deterministic Update Workflow

`scripts/update-w3c-atom-corpus.mjs` takes an explicit upstream checkout path and commit SHA. It does
not fetch the network itself. It:

1. verifies that the checkout HEAD equals the requested full SHA;
2. selects only `testcases/atom/[0-9]*/**/*.xml`;
3. copies files in byte-sorted relative-path order;
4. copies the upstream license unchanged;
5. writes snapshot metadata and SHA-256 checksums to `UPSTREAM.md`;
6. refuses to finish when a selected path has no manifest row or the manifest names a missing path.

CI consumes only checked-in files and never contacts GitHub or the public validator. Upstream updates
are explicit reviewable commits rather than floating dependencies.

## Test Execution

`w3c-feedvalidator.test.ts` performs four gates:

1. **Snapshot integrity:** license, upstream commit, 381 selected paths, manifest coverage, and file
   checksums agree.
2. **Accepted documents:** every `accept` case returns `ok`.
3. **Rejected boundaries:** every `reject` case returns the declared parser error.
4. **Projection semantics:** every `project` case returns the declared DTO values.

The test output includes the upstream relative path and RFC section so a failure points back to the
source corpus. `describe.skip`, `it.skip`, `todo`, and expected failures are forbidden in this suite.

Required commands are:

```sh
yarn vitest run packages/atom-feed/test/conformance/w3c-feedvalidator.test.ts
yarn workspace @rss2pub/atom-feed typecheck
yarn typecheck
yarn test
```

## Documentation and Claims

README and `packages/atom-feed` documentation cite RFC 4287 and the pinned W3C Feed Validator
snapshot. The wording is:

> Tested against the rss2.pub Atom consumer conformance profile derived from the W3C Feed Validator
> RFC 4287 corpus.

Do not say that W3C certifies rss2.pub, that the suite is normative, or that rss2.pub implements the
complete Feed Validator. The RFC is normative; the W3C corpus is the cited regression oracle.

## Acceptance Criteria

- The exact upstream license and attribution are checked in beside the fixtures.
- All 381 selected upstream files have one manifest row and an explicit classification.
- Every `accept`, `reject`, and `project` case executes with zero skips, todos, or xfails.
- Every `not-applicable` case has one allowed reason; there are no free-form blanket exclusions.
- The conformance test passes offline and names W3C path/RFC section on failure.
- Any production correction follows red-green TDD and preserves the package boundary.
- Root typecheck, complete unit/E2E suite, build, and Nix package remain green.
