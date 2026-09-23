# Multilingual Solid Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve twelve fully translated first-party HTML locales from a SolidJS 2 RC/Kobalte UI, with Storybook and Playwright coverage and no late language-driven layout jump.

**Architecture:** Keep Hono, Fedify, application use cases, GET/POST forms, and full-document navigation. Render Solid pages on the server and hydrate only bounded interactive islands from the same component source; pass plain web view models and server-localized strings. Keep existing semantic CSS tokens and make the language control a fixed-size Kobalte component.

**Tech Stack:** Node 24, Hono, SolidJS/`@solidjs/web` `2.0.0-rc.3`, `@kobalte/core` `2.0.0-alpha.2`, Lingui core, Vite/Solid compiler, Storybook Solid Vite, Playwright, Vitest, Yarn 4, Nix.

**Spec:** `docs/superpowers/specs/2026-09-23-multilingual-solid-web-design.md`

## Global Constraints

- Initial locales: `en`, `ko`, `ja`, `zh-Hans-CN`, `zh-Hant-TW`, `de`, `fr`, `es`, `it`, `nl`, `pl`, `pt-PT`.
- Horizontal writing only; retain direction metadata and CSS logical properties for later RTL locales.
- Keep locale priority `?lang=` → cookie → `Accept-Language`; retain `Vary`, canonical, and `hreflang` behavior.
- Pin Solid and Kobalte to the exact mutually declared versions above; keep Lingui `@lingui/core`, not `@lingui/solid` while its peer range excludes Solid 2.
- Every visible string lives in `messages.ts` and compiled checked-in locale catalogs; no English fallback in a shipped non-English catalog.
- Preserve home registration, search browse/results/empty, actor, post, and remote-follow behavior.
- Keep HTTP/i18n composition in `src/web` and Solid presentation in `packages/web-ui`; the package imports no domain or infrastructure module. Preserve the inward dependency rule and existing token/contrast discipline.
- Run `yarn typecheck && yarn test`, Playwright UI tests, and relevant build/package checks before completion.
- Every `yarn.lock` change requires refreshed `nix/missing-hashes.json` and `flake.nix` `yarnOfflineCache.hash`.
- Work in the current checkout; do not create a worktree.

## Review Focus

- `zh-TW` and `zh-Hant` must choose `zh-Hant-TW`; `zh-CN` and `zh-Hans` must choose `zh-Hans-CN`, including from `Accept-Language` quality ordering. Task 1 pins these cases.
- A search query containing `&`, quotes, and `<` must survive locale switching without HTML/script injection. Tasks 1 and 3 pin this.
- A registration POST result must have a GET address so a language switch retains its feed and cannot repeat the registration. Task 5 pins this.
- Hydration must preserve the server's language and geometry; the popup must position and restore focus at 320px. Tasks 2 and 4 pin this.
- Missing or uncompiled catalog messages must fail a test before release; long translated labels and user-supplied bidi text must not widen the page. Tasks 6 and 7 pin this.

## File map

`src/web/locale.ts` owns locale metadata and URL rewriting; `src/web/locale-middleware.ts` owns negotiation; `src/web/i18n.ts` maps every locale to its compiled catalog. `packages/web-ui/src/` owns Solid presentation components and token-based CSS, with one shared token source throughout migration. `packages/web-ui/src/view-models.ts` defines plain page inputs; `server.tsx` renders pages/islands and `client.tsx` hydrates islands only. `src/web/routes.ts` and `src/web/federation-pages.ts` keep HTTP and use-case work. `.storybook/` and `test/ui/` exercise the same UI in isolation and in a browser. `Containerfile` and `flake.nix` include built assets.

### Task 1: Locale metadata and negotiation

**Files:** Modify `src/web/locale.ts`, `src/web/locale-middleware.ts`, `src/web/i18n.ts`, `lingui.config.ts`; create `src/web/locales/{locale}.po` and generated `{locale}.ts` for the ten new locales; test `test/unit/web/locale.test.ts`, `test/unit/web/routes.test.ts`, `test/unit/web/i18n.test.ts`.

**Interfaces:** Produce `Locale`, `SUPPORTED_LOCALES`, `LOCALE_META: Record<Locale, { label: string; shortLabel: string; direction: "ltr" | "rtl" }>`, `resolveLocale`, `switchLocalePath`, `neutralLocalePath`, and `negotiateLocale`. Existing routes consume the same `c.get("language")` result.

- [ ] Write tests for all twelve exact tags and Chinese aliases/regions; test query-over-cookie-over-header ordering, `q` ordering, unsupported values, and a locale switch preserving `/search?q=%3C%26%22`. Assert returned `<html lang>` and retained `Vary`/cookie behavior. Add catalog key-set and nonempty-message assertions for all locales.
- [ ] Run `yarn vitest run --project unit test/unit/web/locale.test.ts test/unit/web/routes.test.ts`; confirm failures come from missing locale cases, not a broken runner.
- [ ] Add exact locale metadata and a parser that first checks exact BCP 47 tags, then maps Chinese script/region (`Hant`/`TW`/`HK`/`MO` to Taiwan catalog; `Hans`/`CN`/`SG`/bare `zh` to mainland catalog), then matches other base languages. Sort `Accept-Language` candidates by descending quality with original order as the tie breaker. Explicit query or cookie values that are unsupported do not override a valid lower-priority signal. Extract, translate, compile, and statically import all new locale catalogs in the same task so the expanded locale union never points at a missing catalog.
- [ ] Keep the middleware attached to each HTML route, never globally. Verify `?lang=` persistence and `Vary: Accept-Language, Cookie` without adding cookies to federation/health JSON routes.
- [ ] Run the focused tests and `yarn typecheck`; inspect the generated locale links for encoded query safety.

### Task 2: Solid/Kobalte server-and-browser compatibility slice

**Files:** Modify `package.json`, `yarn.lock`, `Containerfile`, `flake.nix`, `nix/missing-hashes.json`; create `packages/web-ui/package.json`, TypeScript/Vite configs, `src/server.tsx`, `src/client.tsx`, and `src/view-models.ts`; test an isolated server-render/hydration smoke page under `test/`.

**Interfaces:** Produce server `renderLocalePicker(props: LocalePickerProps): string` and browser hydration of those same plain props; later page renderers consume plain `PageViewModel` values. Route adapters construct them without exposing repositories or class instances.

- [ ] Create a smoke test that serves a Solid component containing Kobalte Popover from Hono; assert server HTML contains the right text, browser hydration preserves text, the popup opens by keyboard and positions inside the viewport, and focus returns to its trigger after Escape. Kobalte Select is excluded: alpha.2's Select bundle imports `readShallow`, absent from Solid RC.3.
- [ ] Run the smoke test and record its expected initial failure while the Solid toolchain is absent.
- [ ] Install the exact compatible Solid/Kobalte versions, Vite 8, and `@solidjs/vite-plugin` from its rc.3-compatible next series. Verify the resolved Solid compiler version in `yarn.lock`. Build separate `dist/client` and `dist/server` outputs so Vite's output cleaning cannot erase `tsc` output. Use a serialized JSON script with `<`, `>`, `&`, U+2028, and U+2029 escaped; parse it in `client.tsx` and hydrate only the picker with the same locale/props. Keep normal links/forms functional before hydration.
- [ ] Serve built assets from Hono with immutable caching for hashed names, and include them in Docker/Nix outputs. Recompute the required Nix hashes after the lockfile settles.
- [ ] Run the smoke test, `yarn typecheck`, `yarn build`, and package smoke checks. If Kobalte alpha/RC behavior fails, resolve this gate before migrating production pages; do not install an unsupported peer combination.

### Task 3: Shared Solid layout and design tokens

**Files:** Keep `src/web/ui/layout.tsx` as Hono's document shell; replace page body uses of `src/web/ui/components.tsx` with Solid primitives under `packages/web-ui/src/`; reuse `src/web/ui/styles.ts` without creating a second token source; test `test/unit/web/styles.test.ts`, `test/unit/web/routes.test.ts`.

**Interfaces:** Keep Hono `Layout` for the document shell and produce Solid `Button`, `Field`, `Notice`, `FeedCard`, `AccountHandle`, and `LocalePicker` with stable exported props. Consume Task 1 locale metadata and Task 2 SSR/hydration bridge.

- [ ] Add failing server tests for `<html lang dir>`, all `hreflang` links, a fixed header language trigger, no translated text replacement marker, and safe quoted search-query output. Add a CSS integrity test for logical inset/padding/margin in direction-sensitive UI rules.
- [ ] Verify the tests fail on the current Hono JSX layout.
- [ ] Port page body primitives to Solid JSX while keeping the Hono document shell. Preserve existing semantic tokens, both theme palettes, WCAG AA pairs, 44px targets, focus style, title/description wrapping, identifier clipping, and reduced-motion behavior. Use `bdi` or explicit direction isolation for handles, URLs, code, and feed-authored text.
- [ ] Use a fixed two-row mobile header and one-row desktop header; the locale trigger has fixed width independent of its translation. Keep no-script locale links in the SSR output.
- [ ] Run focused layout/style tests, keyboard smoke test, and `yarn typecheck`.

### Task 4: Kobalte language picker and interaction states

**Files:** Create `packages/web-ui/src/locale-picker.tsx`; update shared CSS and localized descriptors in `src/web/ui/messages.ts`; test `test/ui/locale-picker.spec.ts`.

**Interfaces:** `LocalePicker` consumes plain `{ currentLocale, currentShortLabel, buttonLabel, options: { locale, label, href }[] }` from Hono; Hono calls `switchLocalePath` to build links. The picker never mutates the global Lingui instance after first paint.

- [ ] Write browser tests for current locale announcement, Tab/Shift+Tab/Enter/Escape, focus return, pointer outside close, all twelve native names, same-page search-query preservation, popup viewport fit at 320px, and functional locale links with JavaScript disabled.
- [ ] Verify those tests fail against the placeholder control.
- [ ] Implement the picker with Kobalte Popover and real destination links. Keep the current choice marked; use standard Tab order for the links and restore focus to the trigger on Escape. Reserve the closed control's size and popup max block size; use CSS logical positioning and `prefers-reduced-motion` handling.
- [ ] Run Playwright picker tests and the existing locale/server tests.

### Task 5: Product routes and registration result URL

**Files:** Replace `src/web/ui/pages.tsx`; change `src/web/routes.tsx` to route adapters and add an application lookup use case using the existing `FeedRepository.findByHandle`; update `src/web/app.ts`; test `test/unit/web/routes.test.ts` and corresponding application unit tests.

**Interfaces:** `HomeViewModel`, `SearchViewModel`, and `RegistrationViewModel` are plain JSON members of `PageViewModel`. The lookup use case accepts a raw handle and returns `Result<Feed, InvalidHandle | FeedNotFound>`; the GET result route consumes it.

- [ ] Write failing tests that retain home popular limit, search browse/results/empty behavior, escaped query, POST validation errors with draft URL, and a 303 success redirect to a GET result page. Assert locale switching on that GET page preserves feed identity and does not call registration again.
- [ ] Verify the focused tests fail for the new result URL/renderer.
- [ ] Implement the lookup through domain value constructors and repository port; map domain values to JSON view models at the web boundary. Port pages to Solid without changing copy IDs or basic HTTP form semantics.
- [ ] Replace inline copy/pending scripts with Solid behavior that preserves no-script form submission and reserves button/status geometry before interaction.
- [ ] Run focused tests, `yarn typecheck`, and the main route browser journeys.

### Task 6: Federation-facing HTML pages

**Files:** Replace UI JSX in `src/web/federation-pages.tsx` with Solid view models/components; test `test/unit/web/federation-pages.test.ts` and relevant `test/e2e/` cases.

**Interfaces:** Actor, post, remote-follow, and error view models join `PageViewModel`; the existing HTTP content-negotiation and Fedify JSON routes remain owned by Hono/Fedify.

- [ ] Write failing SSR tests for localized actor/post pages, sanitized content, date formatting, remote-follow form/error, and stable actor URLs; assert ActivityPub JSON responses and headers remain unchanged.
- [ ] Verify the failures arise from the new view-model/renderer expectation.
- [ ] Move HTML rendering only into Solid components. Keep sanitization at the current web/infrastructure boundary, never pass unsanitized HTML to a component, and preserve exact federation URL generation.
- [ ] Run federation page unit tests, remote federation E2E, and `yarn typecheck`.

### Task 7: Catalog quality and UI copy audit

**Files:** Modify `src/web/ui/messages.ts`, `src/web/locales/{locale}.po`, compiled `{locale}.ts`; test `test/unit/web/i18n.test.ts`.

**Interfaces:** `i18nFor(locale: Locale): I18n` remains immutable and total. Catalogs share the explicit descriptor IDs in `messages.ts`.

- [ ] Extend tests so every locale's catalog has exactly the declared IDs, no empty translation, valid ICU placeholders/plurals, and correct native-script examples; test the unchanged English/Korean known strings and Chinese simplified/traditional differentiation. Add checks for any new picker/result copy added in Tasks 4–6.
- [ ] Verify failures for an intentionally missing new message in a temporary test fixture before restoring the complete catalog.
- [ ] Review all twelve catalogs for product vocabulary, ICU syntax, and unintended English fallbacks; extract and translate any copy added during the UI migration. Replace the old assertion that *every* non-English string differs byte-for-byte from English with completeness and approved-identical-term checks; proper names may legitimately match.
- [ ] Run `yarn i18n:extract && yarn i18n:compile` twice and confirm the second run yields no diff; run catalog tests and `yarn typecheck`.

### Task 8: Storybook component workshop

**Files:** Create `.storybook/main.ts`, `.storybook/preview.ts`, component `*.stories.tsx`; modify `package.json`, `yarn.lock`, Nix hashes.

**Interfaces:** Stories import the production components, `LOCALE_META`, catalogs, and CSS; they define fixtures, not copied component implementations or extra tokens.

- [ ] Create stories for Button tiers/states, Field error/pending, Notice kinds, FeedCard with long title/URL/handle, AccountHandle, LocalePicker, and the shared header. Parameterize light/dark and representative `en`, `ko`, `ja`, `zh-Hans-CN`, `zh-Hant-TW`, and `de` labels plus an RTL direction fixture.
- [ ] Run Storybook build and inspect missing-module/transform errors as the initial integration check.
- [ ] Configure the Solid Vite Storybook adapter, import production CSS once, and use actual compiled catalogs. Add an automated Storybook build command and a CI gate.
- [ ] Build Storybook and inspect the mobile, long-copy, focus, and theme stories in a browser.

### Task 9: Playwright UI gate and packaging

**Files:** Create `playwright.config.ts`, `test/ui/*.spec.ts`, deterministic fake-server fixture, `.github/workflows/` UI job; modify `package.json`, `Containerfile`, `flake.nix`, Nix hashes, `README.md`.

**Interfaces:** The UI server fixture calls the real `createWebRoutes` with deterministic in-memory use cases, uses an ephemeral port, and never fetches the internet. Playwright launches pinned Chromium and tests rendered pages, not component internals.

- [ ] Add failing browser tests for every initial locale's heading and `<html lang>`, Chinese negotiation, search/query locale navigation, rejected and successful registration, actor navigation, keyboard/focus, clipboard, 320/375px overflow, 200% zoom, dark mode, reduced motion, and hydration layout shift. For the last case, use `PerformanceObserver` on `layout-shift` entries before hydration and assert cumulative score below 0.01 after idle.
- [ ] Verify the test suite detects at least one missing behavior before adjusting production code.
- [ ] Fix only the observed UI gaps. Pin browser/OS/font context for snapshots; capture stable representative states rather than every locale permutation. Keep browser tests separate from database E2E, but required in CI.
- [ ] Run `yarn typecheck && yarn test`, `yarn test:ui`, `yarn build`, Storybook build, Docker smoke test, and `nix build .#`; inspect `git diff --check` and the final lock/Nix hash diff.

## Completion check

Review each spec section against tasks 1–9. Record exact versions and all command results in the delivery note. Do not mark the migration complete while any locale is incomplete, any first-party page body still uses Hono JSX, or the browser/package gates are red.
