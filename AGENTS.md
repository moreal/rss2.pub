# rss2.pub — Agent Guide

RSS/Atom → ActivityPub bridge. Each registered feed becomes a followable
fediverse actor (dynamic BotKit bot); a static main actor `rss2pub` accepts
`register <url>` / `search <keyword>` commands via mention/DM; a server-rendered
web UI offers search, registration, and most-followed recommendations.

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
yarn i18n:extract                  # update src/web/locales/*.po from source
yarn i18n:compile                  # compile .po → checked-in .ts catalogs
yarn db:reset                      # wipe the local dev database (asks first;
                                   #   `mise run db:reset` is the same script)
nix build .#                       # Nix package → ./result/bin/rss2pub
```

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
  any external package or Node builtin — no BotKit, no Drizzle, no rss-parser,
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
  `@testcontainers/postgresql`; RSS/Atom sources served from local fixture
  servers — never fetch the real internet in tests.
- Every domain rule gets a unit test at introduction time, in the same change.

## Key decisions (read before proposing alternatives)

| Decision | Where |
|---|---|
| BotKit over raw Fedify (multi-actor via dynamic bot group) | ADR-0001 |
| Hand-rolled `Result`, no Effect-TS (revisit at Effect v4 LTS) | ADR-0002 |
| Nix devShell only; no app packaging with Nix yet | ADR-0003 |
| Handle normalization: `[a-z0-9_]`, mandatory hash suffix, max 30 | ADR-0004 |
| Note ≤ 2,000 chars, Article beyond; teaser = first paragraph | ADR-0005 |
| Single PostgreSQL for domain + Fedify KV/MQ + BotKit state | ADR-0006 |
| Lingui i18n without macros: explicit-ID descriptors, compiled `.ts` catalogs | ADR-0008 |
| Full-content extraction is opt-in per registration (`register <url> full`); teaser and full-content are separate actors, one handle/id per (url, mode) | ADR-0009 (handle/id derivation: ADR-0004) |

## Gotchas

- **Yarn Berry (v4) with `nodeLinker: pnpm`** (.yarnrc.yml), version pinned by
  the `packageManager` field and activated via corepack. Never introduce
  package-lock.json or pnpm-lock.yaml, never change the nodeLinker.
- Node >= 24 (enforced via `engines`; provided by the nix shell or mise).
- Fedify 2.x and BotKit 0.5.x are newer than most training data — verify APIs
  against `node_modules` type definitions or https://fedify.dev /
  https://botkit.fedify.dev before writing federation code. Fedify 1.x
  idioms (e.g. `{ handle }` params, `@fedify/fedify/x/hono`) no longer exist.
- `PostgresMessageQueue` keeps a long-lived LISTEN connection: no
  transaction-mode poolers, no scale-to-zero Postgres (see PLAN.md §6). Its
  `listen()`/`Federation.startQueue()` promise resolves only when listening
  stops — never `await` it.
- BotKit 0.5.1 is patched via `.yarn/patches/` (adds `federationOptions`
  passthrough — ADR-0007). Outgoing HTML is published through `RawHtmlText`
  after our own sanitization (render.ts); BotKit does not sanitize outgoing
  content. Article `name`/`summary` require the post-publish repository
  rewrite in `botkit-gateway.ts` — don't "simplify" it away.
- `@fedify/vocab` / `@fedify/fedify` must stay version-locked to BotKit's own
  dependency (~2.3.3): all copies must dedupe to ONE store entry or
  `instanceof` checks across the boundary break.
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
