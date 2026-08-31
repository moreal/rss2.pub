# rss2.pub — Agent Guide

Atom → ActivityPub bridge. Each registered Atom feed becomes a followable
fediverse actor (dynamic BotKit bot); a static main actor `rss2pub` accepts
`register <url>` / `search <keyword>` commands via mention/DM; a server-rendered
web UI offers search, registration, and most-followed recommendations.

Input is Atom-only: [ADR-0012](docs/adr/0012-atom-only-input-and-parser-package.md)
removed RSS support and `rss-parser`. M6 intentionally retains BotKit; the raw
Fedify migration in [ADR-0013](docs/adr/0013-raw-fedify-over-botkit.md) is not
implemented until M7.

Full plan and researched decisions: `docs/PLAN.md`. Decision records: `docs/adr/`.

## Commands

```sh
nix develop                        # dev shell: Node 24 + Yarn Berry + psql (or use direnv)
# without nix: mise provides Node 24 (mise.toml), then `corepack enable` once
yarn install --immutable
yarn typecheck                     # tsc --noEmit over src + test
yarn test:unit                     # fast, no I/O
yarn test:e2e                      # real server + containers (M3+)
yarn test                          # everything
yarn atom:conformance:update       # regenerate the pinned W3C Atom manifest
yarn i18n:extract                  # update src/web/locales/*.po from source
yarn i18n:compile                  # compile .po → checked-in .ts catalogs
yarn db:reset                      # wipe the local dev database (asks first;
                                   #   `mise run db:reset` is the same script)
nix build .#                       # Nix package → ./result/bin/rss2pub
```

## W3C Atom consumer conformance profile

RFC 4287 is the normative Atom format specification. The pinned W3C Feed
Validator corpus is a regression oracle for rss2.pub's consumer conformance
profile, not a claim of full Feed Validator parity or W3C endorsement. It
accounts for all 381 selected paths: the 62 upstream no-error Atom Feed
Documents are accepted or projected, while standalone Atom Entries are
rejected by product policy.

After cloning, initialize the test-only corpus exactly once:

```sh
git submodule update --init --depth 1 vendor/w3c-feedvalidator
```

When changing the reviewed submodule pin, move the gitlink, run
`yarn atom:conformance:update`, review every classification and checksum
change, and run the complete repository gate. Do not edit the generated
manifest by hand. The corpus is not a runtime or Nix package input. Attribution,
license location, and the exact pin are in
`packages/atom-feed/test/conformance/W3C-FEEDVALIDATOR.md`.

After ANY yarn.lock change, both `nix/missing-hashes.json` and
`yarnOfflineCache.hash` in flake.nix must be refreshed, or `nix build` fails:

```sh
nix run nixpkgs#yarn-berry_4-fetcher.yarn-berry-fetcher -- \
  missing-hashes yarn.lock > nix/missing-hashes.json
nix run nixpkgs#yarn-berry_4-fetcher.yarn-berry-fetcher -- \
  prefetch yarn.lock nix/missing-hashes.json   # → new hash value
```

**Quality gate**: `yarn typecheck && yarn test` must pass before any task is
considered done. The `/checks` skill runs this loop.

## Architecture — the dependency rule

DDD + hexagonal. Imports point inward only:

```
src/shared  ←  src/domain  ←  src/application  ←  src/infrastructure
                                               ←  src/web (composition root)
```

- `src/shared`: `Result`, `Brand`, hashing — pure utilities with no I/O. This
  is the only layer below infrastructure allowed to wrap Node built-ins, and
  only pure, deterministic ones (e.g. `node:crypto` hashing — never fs/net/timers).
- `src/domain`: entities, value objects, domain services, and **ports**
  (interfaces in `src/domain/ports/`). Imports only `src/shared` and other
  domain modules. **Never** imports application/infrastructure/web and **never**
  any external package or Node builtin — no BotKit, no Drizzle, no parser
  not even their types. Platform primitives reach domain only via `src/shared`
  wrappers or ports.
- `src/application`: use cases orchestrating domain via ports. Imports domain +
  shared only.
- `src/infrastructure`: adapters implementing ports. External packages live
  here and only here.
- `src/web`: Hono app + composition root. The only place where everything is wired.

Violations of this rule are bugs even when the code works. The
`domain-reviewer` agent (`.claude/agents/domain-reviewer.md`) checks for them.

## Type discipline

- **Parse, don't validate**: value objects are created only through smart
  constructors returning `Result<T, E>` (e.g.
  `FeedUrl.create(raw): Result<FeedUrl, InvalidFeedUrl>`). Holding the type
  proves validity; invalid states are unrepresentable.
- **Branded types** (`src/shared/brand.ts`) for every identifier — `FeedId` and
  `ItemId` must not be interchangeable.
- **Expected failures return `Result`** (`src/shared/result.ts`); error types
  are discriminated unions per module. `throw` is reserved for programmer
  errors and unrecoverable states — never for domain outcomes.
- No `any`, no `as` casts to silence errors, no non-null assertions. If the
  type fights you, the model is wrong — fix the model.
- ESM + NodeNext: relative imports **must** end in `.js`
  (`import { ok } from "../shared/result.js"`).

## Workflow for new features

Follow the `/add-feature` skill: domain (values/entities/ports + unit tests) →
application (use case + unit tests against in-memory ports) → infrastructure
(adapter) → wiring in `src/web` → e2e when user-visible. Never start from the
adapter.

## Testing conventions

- `test/unit` mirrors `src/`; no network, no disk, no timers without fake
  clocks (the `Clock` port exists for this).
- `test/e2e`: boots the real server on an ephemeral port; PostgreSQL via
  `@testcontainers/postgresql`; Atom sources served from local fixture
  servers — never fetch the real internet in tests.
- Every domain rule gets a unit test at introduction time, in the same change.

## Key decisions (read before proposing alternatives)

| Decision | Where |
|---|---|
| Atom-only input and dedicated parser package | ADR-0012 |
| Raw Fedify over BotKit (planned after M6) | ADR-0013 |
| Hand-rolled `Result`, no Effect-TS (revisit at Effect v4 LTS) | ADR-0002 |
| Nix devShell only; no app packaging with Nix yet | ADR-0003 |
| Handle normalization: `[a-z0-9_]`, mandatory hash suffix, max 30 | ADR-0004 |
| Note ≤ 2,000 chars, Article beyond; teaser = first paragraph | ADR-0005 |
| Single PostgreSQL for domain + Fedify KV/MQ + BotKit state | ADR-0006 |
| Lingui i18n without macros: explicit-ID descriptors, compiled `.ts` catalogs | ADR-0008 |
| Full-content extraction is opt-in per registration (`register <url> full`); teaser and full-content are separate actors, one handle/id per (url, mode) | ADR-0009 (handle/id derivation: ADR-0004) |
| Actor avatar resolved from the channel link's favicon on the first poll (not at registration); resolved once, never re-fetched | ADR-0010 |
| Post language tagging: Atom `xml:lang` at feed root *and* per-entry override | ADR-0011, amended by ADR-0012 |

## Gotchas

- **Yarn Berry (v4) with `nodeLinker: pnpm`** (.yarnrc.yml), version pinned by
  the `packageManager` field and activated via corepack. Never introduce
  package-lock.json or pnpm-lock.yaml, never change the nodeLinker.
- Node >= 24 (enforced via `engines`; provided by the nix shell or mise).
- Fedify 2.x and BotKit 0.6.x are newer than most training data — verify APIs
  against `node_modules` type definitions or https://fedify.dev /
  https://botkit.fedify.dev before writing federation code. Fedify 1.x
  idioms (e.g. `{ handle }` params, `@fedify/fedify/x/hono`) no longer exist.
- `PostgresMessageQueue` keeps a long-lived LISTEN connection: no
  transaction-mode poolers, no scale-to-zero Postgres (see PLAN.md §6). Its
  `listen()`/`Federation.startQueue()` promise resolves only when listening
  stops — never `await` it.
- BotKit 0.6.0-dev.348 is used unpatched — its `federationOptions` field
  (natively typed `FederationInfrastructureOptions`, upstreamed in response to
  fedify-dev/botkit#41) replaced the `.yarn/patches/` passthrough we carried
  through 0.6.0-dev.345 (ADR-0007, superseded). The exact dev version is
  preapproved in .yarnrc.yml past the npm minimal-age gate. Outgoing HTML is
  published through `RawHtmlText` after our own sanitization (render.ts);
  BotKit does not sanitize outgoing content. Since 0.6, `session.publish()`
  takes `name`/`summary`/`url` directly (ADR-0007 amendment) — pass Article
  summaries as `RawInlineHtmlText`, never as a string (strings get escaped).
- `@fedify/vocab` / `@fedify/fedify` must stay version-locked to BotKit's own
  dependency (~2.3.5): all copies must dedupe to ONE store entry or
  `instanceof` checks across the boundary break.
- **The web UI has one design system: `src/web/ui/styles.ts`.** Every colour,
  spacing step, type size, radius and focus style is a `--token` on `:root`
  there (with a dark-mode block redefining the same semantic roles); pages and
  components reference `var(--…)` and never a literal value. Text colours are
  chosen for contrast, not brand — the bright `--brand` orange is decorative
  only, while `--accent` / `--accent-ink` are the AA-passing pair used for
  fills and text. `test/unit/web/styles.test.ts` enforces both halves of that:
  every foreground/background role pair a page renders clears WCAG 2.2 AA
  (4.5:1) in *both* themes, and no rule outside the `:root` blocks may name a
  raw colour. Retune a token and that test tells you if it still passes.
  `src/infrastructure/federation/pages-theme.ts` restates the same palette for
  BotKit's `/@handle` pages and must be updated alongside.
  UI primitives (feed card, notice, forms, icons) live in `components.tsx` /
  `icons.tsx`; `pages.tsx` composes them and owns no styling of its own.
  Buttons come in three tiers and the page should use all three rather than
  promoting everything: `btn-primary` for the one action the page exists for,
  `btn-secondary` for a useful follow-up, `btn-quiet` for a way out.
- **`STYLE`, `COPY_SCRIPT` and `PENDING_SCRIPT` are emitted through `raw()`**
  (layout.tsx). Hono escapes `"`, `<`, `>` and `&` in text children, which
  silently corrupted quoted font names and would break any child selector or
  script. A unit test pins this. Corollary: never put a backtick in those
  literals.
- **The most-followed list is one list on two surfaces, and the split is
  deliberate.** The home page's job is registration, so it shows
  `HOME_POPULAR_LIMIT` (8) of the list and nothing more; `/search` with no
  query shows all of it, which is this product's only way to *browse* rather
  than search. The home route asks for one row past the limit and drops it —
  that extra row, not `popular.length`, is how the page knows whether to
  render the "See more feeds" link. `/search`'s three states are a
  discriminated `SearchState` (`browse` | `results`), and the blank-query
  branch is driven by `SearchFeeds`' own `EmptyQuery` error rather than by
  the route re-deciding what "empty" means: don't reintroduce a `.trim()`
  test in the route, and don't turn the browse state back into a dashed "type
  something" box — that screen was almost entirely empty. The search field's
  placeholder is examples; the sentence explaining what matches is help text
  wired with `aria-describedby`.
- **The feed list's identifiers are clipped, not wrapped, and that only holds
  because every box above them opts out of the automatic minimum size.** The
  handle and the source URL are `white-space: nowrap` with an ellipsis; a
  grid item's default `min-width: auto` is its content's min-content width, so
  without `min-width: 0` on `ul.feeds li` and `.feed-meta` the widest handle
  in the list silently widens the column and the whole page scrolls sideways
  on a phone. `test/unit/web/styles.test.ts` pins the pair. Feed titles and
  descriptions carry `word-break: keep-all` (their language is the *feed's*,
  so the `:lang(ko)` rule cannot reach them) plus `overflow-wrap: anywhere` —
  `break-word` loses to `keep-all` and lets a long bare domain overflow.
- **Web UI strings are localized** (en/ko — ADR-0008). Never hardcode
  user-facing copy in pages/routes: add a `/*i18n*/`-annotated descriptor to
  `src/web/ui/messages.ts` (exported as `copy`, not `msg` — that name belongs
  to the Lingui macro we don't use), then `yarn i18n:extract`, translate
  `src/web/locales/ko.po`, `yarn i18n:compile`, and commit the `.po` **and**
  generated `.ts` catalogs. The extractor runs without macros: it only sees
  receivers literally named `i18n` and silently skips spread descriptors, so
  keep definitions in messages.ts annotated. `src/web/locale.ts` is the single
  locale list (shared with `lingui.config.ts`) — keep it catalog-free so the
  config can import it before any catalog exists.
- **The compiled catalog, not `messages.ts`, is what users read.** A descriptor's
  `message` is only a fallback for an id missing from the catalog, so editing
  copy without recompiling silently ships the old text. Three guards, each
  covering a different mistake: the unit tests fail if a placeholder-free
  English string drifts from its catalog entry, or if a Korean message is left
  equal to English (`fallbackLocales` would otherwise hide it); CI re-runs
  extract+compile and fails on any diff (both are idempotent, so a clean tree
  stays clean).
