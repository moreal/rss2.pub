# W3C Atom Consumer Conformance Profile Design

- Status: approved in principle (2026-08-31); awaiting written-spec review
- Product milestone: M6 Atom-only feed foundation
- Normative format: RFC 4287, The Atom Syndication Format
- Reference corpus: W3C Feed Validator commit `9ce274c9db93796b8ab2a44952b9da80811bf765`

## Goal

Give `@rss2pub/atom-feed` a reproducible, cited standards test layer based on the W3C Feed
Validator corpus. Every upstream Atom case in the selected snapshot must be accounted for, and every
case applicable to rss2.pub's consumer contract must run in CI without network access after submodule
checkout, skips, xfails, or silent exclusions.

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
substantial portions. The repository is included unmodified as a Git submodule, so its original
`LICENSE` remains at `vendor/w3c-feedvalidator/LICENSE`. A root-owned attribution document records
the repository, pinned commit, selection rule, and the fact that no upstream fixture is modified.
No W3C logo or claim of W3C endorsement is made.

## Corpus Selection

Add `https://github.com/w3c/feedvalidator.git` as the Git submodule
`vendor/w3c-feedvalidator`, pinned by the superproject gitlink to the full snapshot commit. Select
every XML fixture below a numbered Atom directory:

```text
testcases/atom/[0-9]*/**/*.xml
```

At the pinned commit this selects 381 files. It includes the RFC 4287 section-oriented suites such
as `3.1.1.3`, `4.1.2`, and `4.2.7.2`.

Do not select these paths for the profile:

- `testcases/atom/must` and `testcases/atom/should`: legacy pre-1.0 draft cases whose element names
  include `modified`, `issued`, `tagline`, and `info` rather than final RFC 4287 vocabulary.
- directory indexes, `.htaccess`, headers, and footers: Feed Validator web presentation rather than
  conformance input.

The selected file count and each relative path are pinned in the manifest. Moving the submodule
gitlink, or adding, removing, or renaming a selected upstream file without updating its manifest row
fails the suite.

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
.gitmodules
vendor/
  w3c-feedvalidator/                 # Git submodule pinned to the reviewed commit
packages/atom-feed/test/conformance/
  w3c-feedvalidator.test.ts
  w3c-feedvalidator-cases.ts
  W3C-FEEDVALIDATOR.md               # attribution, profile scope, pinned commit
scripts/
  update-w3c-atom-manifest.mjs
```

Production files in `packages/atom-feed/src` remain free of Node built-ins. Test code may use
`node:fs` and `node:path` to enumerate the corpus inside the initialized submodule. The root update
script is developer tooling and is not included in the runtime package output. Nix and Container
runtime packages do not copy `vendor/`; it is test input only.

## Deterministic Update Workflow

The normal checkout command is:

```sh
git submodule update --init --depth 1 vendor/w3c-feedvalidator
```

GitHub Actions configures `actions/checkout` with `submodules: true`. No test contacts the public W3C
validator or GitHub after checkout. A missing submodule fails with an actionable message naming the
initialization command rather than reporting hundreds of missing fixtures.

`scripts/update-w3c-atom-manifest.mjs` reads the initialized submodule and an explicit full commit
SHA. It:

1. verifies that the submodule HEAD equals the requested full SHA;
2. selects only `testcases/atom/[0-9]*/**/*.xml`;
3. enumerates files in byte-sorted relative-path order;
4. verifies the upstream `LICENSE` is present;
5. updates snapshot metadata and SHA-256 checksums in `W3C-FEEDVALIDATOR.md`;
6. refuses to finish when a selected path has no manifest row or the manifest names a missing path.

Updating upstream is an explicit two-part review: move the submodule gitlink to a named commit, then
regenerate and review the manifest/checksum diff. The submodule never tracks a floating branch.

## Test Execution

`w3c-feedvalidator.test.ts` performs four gates:

1. **Snapshot integrity:** initialized submodule, license, pinned commit metadata, 381 selected paths,
   manifest coverage, and file checksums agree.
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

- `.gitmodules` uses the HTTPS W3C repository URL and the superproject gitlink pins the reviewed full
  commit.
- The initialized submodule contains the exact upstream license; root documentation records
  attribution, profile scope, and the pin.
- All 381 selected upstream files have one manifest row and an explicit classification.
- Every `accept`, `reject`, and `project` case executes with zero skips, todos, or xfails.
- Every `not-applicable` case has one allowed reason; there are no free-form blanket exclusions.
- The conformance test passes offline and names W3C path/RFC section on failure.
- Any production correction follows red-green TDD and preserves the package boundary.
- Root typecheck, complete unit/E2E suite, build, and Nix package remain green.
