# Multilingual Solid web UI design

## Purpose and scope

Extend the first-party HTML UI beyond English and Korean, migrate its renderer to
SolidJS 2 RC, and establish reusable Kobalte-based components, Storybook, and
Playwright browser coverage. This includes home, search, registration results,
feed actor pages, the main actor page, post pages, and remote-follow pages.
ActivityPub JSON, WebFinger, command replies, domain rules, and feed ingestion
remain outside this change. Hono remains the HTTP composition root.

The initial locale set is `en`, `ko`, `ja`, `zh-Hans-CN`, `zh-Hant-TW`, `de`,
`fr`, `es`, `it`, `nl`, `pl`, and `pt-PT`. These are English, Korean, Japanese,
mainland Chinese, Taiwan Chinese, German, French, Spanish, Italian, Dutch,
Polish, and European Portuguese. Each shipped locale has a complete catalog
checked for ICU placeholders, product terminology, and native script;
missing translations fail the repository gate. All locales use
horizontal text. The architecture carries text direction metadata and logical
CSS properties so adding an RTL locale later does not require redesign.

## User experience

Keep the existing task order: registration first on home; browsing and search
on `/search`; follow instructions after registration; the existing actor and
remote-follow flows. Replace the growing row of language links with one
fixed-size language control. Its closed state shows the current locale code and
has a localized accessible name. The opened list uses native language names,
marks the current choice, supports keyboard operation and focus return, and
remains scrollable on narrow screens. A no-script set of links remains usable.
Changing language navigates to the same GET page with its search query intact.

The first HTML response already contains the chosen translation and
`<html lang>`/`dir`. Hydration uses the identical locale and catalog. No
English-first flash or post-hydration translation replacement is allowed.
Different languages naturally wrap to different line counts; the measurable
goal is no visible *late* jump. The header occupies the same geometry in all
locales, controls reserve stable space for pending/success labels, images have
dimensions, and initial-to-hydrated layout shift on key pages is below 0.01.
At 320px width and 200% zoom, there is no page-level horizontal overflow.

Preserve the current `?lang=` → cookie → `Accept-Language` preference order,
`Vary: Accept-Language, Cookie`, locale-specific canonical/hreflang links, and
language choice persistence. Region/script matching must distinguish both
Chinese variants; unsupported values fall back to English. Locale URLs use
BCP 47 tags and encode query values normally. Locale changes on POST results
must keep the result context: successful registration redirects to a GET result
URL backed by a feed lookup. Rejected registration retains its entered URL and
error on the server-rendered page; its locale control may return to home, as
today, but must not silently resubmit the POST.

## Architecture and build

The Hono routes continue to call application use cases and return server HTML.
Place Solid presentation components in the isolated `packages/web-ui` workspace
with its own TypeScript/JSX configuration. Hono retains the document shell
(`<head>`, locale links, shared CSS, and asset tags); Solid server-renders the
home, search, registration, actor, post, and follow page bodies and design
primitives inside it. Define serializable
presentation view models at the `src/web` boundary;
never import infrastructure from a component or serialize domain objects by
accident. Keep normal GET/POST forms and full-document navigation. Solid
renders page bodies on the server. Hydrate only bounded interactive islands
such as the Kobalte language picker; serialize each island's plain props safely
and use the same locale as the server. Copy/pending controls may be separate
islands or progressively enhanced native controls. Do not add a client router
or migrate Fedify routes to SolidStart.

Pin `solid-js` and `@solidjs/web` to `2.0.0-rc.3` and `@kobalte/core` to
`2.0.0-alpha.2`, the versions declared compatible by Kobalte's published peer
dependencies. Kobalte's transitive `@kobalte/utils@2.0.0-alpha.0` still
declares Solid RC.0 peers, so Yarn reports a peer conflict even with this
pair; the compatibility slice must establish whether that is a metadata lag
or a runtime incompatibility. A first vertical slice must prove server
rendering, hydration, keyboard/focus behavior, and portal positioning in a
real browser before the rest of the UI moves. Use Lingui's existing
`@lingui/core` with one immutable
instance per locale and checked-in compiled catalogs. `@lingui/solid` is not
part of this design because its current peer range supports Solid 1 only.

Use a Solid compiler/Vite build for browser and SSR assets while keeping the
Node/Hono production entry point. `packages/web-ui` imports no domain or
infrastructure module; Hono passes it plain view models and localized strings.
The Containerfile and Nix derivation must
include the built assets. Static asset URLs are content-hashed and served by
Hono. A missing browser bundle must never make the basic page, forms, and
language links unreadable. The SSR and browser builds share one component
source for hydrated islands; server-only pages need no full-page hydration
payload. The locale manifest remains shared.

## Design system

Carry forward the existing semantic CSS tokens, light/dark palettes, contrast
checks, 44px touch target, focus-visible treatment, and feed text overflow
rules. Split the current monolithic stylesheet only where shared tokens,
primitive styles, and page styles have clear owners; keep one token source
shared by `src/web` and `packages/web-ui` during migration.
Build a small component API for Button, Field, Notice, FeedCard, AccountHandle,
and LocalePicker. Use Kobalte Popover for the language links and any other interaction
that needs its focus/ARIA behavior; simple native forms and links remain native.
Kobalte's unstyled parts consume the project's tokens rather than introducing
a second styling system. Use CSS logical properties and bidi isolation for
addresses, URLs, code, and user-supplied feed text.

Storybook runs the same Solid components and CSS tokens as production. Stories
cover both themes, all major component states, long translated labels,
Japanese/Chinese text, 320px width, and an RTL fixture. Storybook does not
own production copy or independent styling values.

## Testing and delivery

Vitest retains domain/application and server contract tests. Add tests for
locale negotiation (including both Chinese variants), catalog completeness,
canonical/hreflang, safe serialization, SSR output, and the registration GET
result. Playwright runs against a real local Hono HTTP server with deterministic
fake use cases for UI flows; federation-specific browser checks may use the
existing database-backed fixtures. Cover language switching, search query
preservation, form failure and success, keyboard/focus behavior, clipboard,
dark mode, reduced motion, 320px/375px/200% zoom overflow, and hydration
layout shift. Pin browser and fonts for visual snapshots.

The repository gate remains `yarn typecheck && yarn test`, with Playwright UI
tests added as a separate required script and CI job. After any `yarn.lock`
change, refresh `nix/missing-hashes.json` and `yarnOfflineCache.hash` in
`flake.nix`; verify the container and Nix packaging include browser assets.

## Risks and sequence

1. Verify the pinned Solid/Kobalte pair in this Hono SSR environment. If this
   fails, fix the integration or pin a newer officially compatible alpha/RC
   pair before migrating pages; do not mix unsupported peer versions.
2. Establish locale metadata and complete catalogs, then replace the header
   language control and migrate pages by route while preserving server tests.
3. Add Storybook and browser tests using the production components, then prove
   build/package parity and run the full gate.

The current checkout includes RSS 2.0 support under ADR-0016. Its UI copy is
correct for that current behavior despite older Atom-only guidance elsewhere.
