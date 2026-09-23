# Bilingual VitePress Documentation Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve English and Korean rss2.pub user and operator documentation from GitHub Pages at `https://docs.rss2.pub/`.

**Architecture:** `docs/` is a standalone Yarn Berry project with its own lockfile, so documentation dependencies do not enter the app's Nix dependency graph. VitePress builds the existing English operator documents plus Korean translations. A dedicated GitHub Actions workflow deploys static output from `main`; repository CI builds it without publishing.

**Tech Stack:** Node.js 24, Yarn 4.17.1 with `nodeLinker: pnpm`, VitePress 1.6.4, GitHub Actions and Pages.

**Spec:** `docs/superpowers/specs/2026-09-23-vitepress-docs-site-design.md`

## Global Constraints

- Keep `docs/yarn.lock` separate from the root `yarn.lock`; do not change the root Nix offline-cache hash for docs-only dependencies.
- Publish English at `/` and Korean at `/ko/` on `https://docs.rss2.pub/`.
- Explain Atom 1.0 and RSS 2.0 support accurately; RSS 1.0 is not supported.
- Preserve the root `CHANGELOG.md` as the English release record and avoid copying it into a second tracked English file.
- Keep ADRs, plans, specs, and design notes out of the generated site.
- Use GitHub Pages Actions deployment with only `contents: read`, `pages: write`, and `id-token: write` permissions where needed.
- Do not claim the custom domain is live before DNS and HTTPS checks succeed.

## Review Focus

- Existing links inside `SELF_HOSTING.md`, `DATABASE_MIGRATIONS.md`, `RELEASING.md`, and the included `CHANGELOG.md` resolve after URL rewrites: run `yarn docs:build` with dead-link checking enabled.
- Korean locale navigation stays in `/ko/` and reaches every translated operator page: assert output files and inspect generated links.
- Source plans and ADRs do not become generated pages: assert no corresponding output in `docs/.vitepress/dist`.
- Root app install remains independent of VitePress: assert `vitepress` is absent from root `yarn.lock` and `flake.nix` stays unchanged.
- A docs-only change deploys on `main`, while PRs merely build: inspect workflow triggers and run local docs build.

---

### Task 1: Standalone documentation project and site shell

**Files:**
- Create: `docs/package.json`, `docs/.yarnrc.yml`, `docs/yarn.lock`, `docs/.vitepress/config.ts`, `docs/index.md`, `docs/ko/index.md`
- Modify: `package.json`, `.gitignore`

**Interfaces:**
- Produces `yarn docs:dev`, `yarn docs:build`, and `yarn docs:preview` root scripts, each delegating to the standalone `docs/` project.
- Produces VitePress output at `docs/.vitepress/dist` for Tasks 2 and 3.

- [ ] **Step 1: Pin the independent package and install it.** Write `docs/package.json` with `private: true`, `type: module`, `packageManager: yarn@4.17.1`, `engines.node: >=24`, `vitepress: 1.6.4` in `devDependencies`, and `dev`, `build`, `preview` scripts running `vitepress dev .`, `vitepress build .`, `vitepress preview .`. Write `docs/.yarnrc.yml` as `nodeLinker: pnpm`. Create an empty `docs/yarn.lock` before running `cd docs && corepack yarn install`, so Yarn recognizes a separate project and fills that lockfile.

- [ ] **Step 2: Add root wrappers and ignore generated output.** Add these script values to root `package.json` and lines to `.gitignore`:

  ```json
  "docs:dev": "yarn --cwd docs dev",
  "docs:build": "yarn --cwd docs build",
  "docs:preview": "yarn --cwd docs preview"
  ```

  ```gitignore
  docs/.vitepress/cache/
  docs/.vitepress/dist/
  docs/node_modules/
  ```

- [ ] **Step 3: Build the shell.** Define the initial `docs/.vitepress/config.ts` using this configuration; Task 2 adds the navigation and rewrites:

  ```ts
  import { defineConfig } from 'vitepress'

  export default defineConfig({
    title: 'rss2.pub',
    base: '/',
    srcExclude: ['adr/**', 'superpowers/**', 'design/**', 'PLAN.md'],
    locales: {
      root: { label: 'English', lang: 'en-US' },
      ko: { label: '한국어', lang: 'ko-KR' }
    },
    themeConfig: {
      search: { provider: 'local' },
      editLink: {
        pattern: 'https://github.com/moreal/rss2.pub/edit/main/docs/:path'
      }
    }
  })
  ```

  Add English and Korean home pages with product purpose, Atom/RSS 2.0 registration command and web form, and how to follow the resulting actor. Add guide links when Task 2 creates both locales. Run `yarn docs:build`; confirm `/index.html` and `/ko/index.html` exist and no ADR HTML exists.

- [ ] **Step 4: Commit the shell.** Run `git diff --check`, stage Task 1 files, and commit with exactly one `Assisted-by: Codex:gpt-6-sol` trailer.

### Task 2: Bilingual guides, changelog, and durable links

**Files:**
- Modify: `docs/.vitepress/config.ts`, `CHANGELOG.md`, `docs/RELEASING.md`, `README.md`
- Create: `docs/changelog.md`, `docs/ko/SELF_HOSTING.md`, `docs/ko/DATABASE_MIGRATIONS.md`, `docs/ko/RELEASING.md`, `docs/ko/changelog.md`

**Interfaces:**
- English public paths: `/self-hosting`, `/database-migrations`, `/releasing`, `/changelog` (via `rewrites` or equivalent verified mappings).
- Korean counterparts: `/ko/self-hosting`, `/ko/database-migrations`, `/ko/releasing`, `/ko/changelog`.

- [ ] **Step 1: Wire English documents and changelog.** Configure `rewrites` from existing uppercase English filenames to lowercase public routes. Render the root release record in `docs/changelog.md` using VitePress Markdown inclusion, keeping `CHANGELOG.md` the single English source:

  ```md
  <!--@include: ../CHANGELOG.md-->
  ```

  Adjust its release-policy link to resolve from the site as well as GitHub. Add English navigation for the four public paths. Run `yarn docs:build` and fix actual broken links rather than disabling the checker.

- [ ] **Step 2: Translate the operator guides.** Add Korean pages with sections mapping `Single-host Compose example` to `단일 호스트 Compose 예시`; `Authoring migrations`, `Running the bundled code`, `Operator upgrade` to `마이그레이션 작성`, `포함된 코드 실행`, `운영 환경 업그레이드`; and `Versions and changes`, `Release checklist` to `버전과 변경 기록`, `릴리스 점검표`. Preserve all English command blocks, environment names, URL identity warnings, and numeric limits verbatim. In `docs/ko/changelog.md`, translate all current `Unreleased` entries and link the English canonical changelog. Add Korean navigation with labels `시작하기`, `자가 호스팅`, `DB 마이그레이션`, `릴리스`, `변경 기록`.

- [ ] **Step 3: Set maintenance rules and repository entry points.** Add to `docs/RELEASING.md` the requirement to update the Korean changelog and translated operator instructions when a release changes them. Link the new docs site from the root `README.md`; keep GitHub source links for internal decisions and contribution material.

- [ ] **Step 4: Verify page parity and commit.** Run `yarn docs:build`; confirm `index.html`, `ko/index.html`, all eight guide/changelog HTML files, and no `adr/` or `superpowers/` HTML in output. Inspect English and Korean navigation links. Run `git diff --check` and commit Task 2 with exactly one `Assisted-by: Codex:gpt-6-sol` trailer.

### Task 3: CI, Pages deployment, and domain instructions

**Files:**
- Create: `.github/workflows/docs.yml`, `docs/DEPLOYMENT.md`
- Modify: `.github/workflows/ci.yml`, `docs/RELEASING.md`, `docs/ko/RELEASING.md`

**Interfaces:**
- PR and `main` CI run the docs build without deployment.
- Pushes to `main` deploy the static artifact to GitHub Pages; DNS and Pages custom-domain settings remain explicit operator steps.

- [ ] **Step 1: Add a build gate.** In `.github/workflows/ci.yml`, add a separate documentation job on Node 24 using `actions/checkout@v4`, `actions/setup-node@v4`, `corepack enable`, `yarn --cwd docs install --immutable`, and `yarn docs:build`. Verify it has no Pages write permission.

- [ ] **Step 2: Add Pages workflow.** Configure `.github/workflows/docs.yml` for `push` to `main` on `docs/**`, `CHANGELOG.md`, `.github/workflows/docs.yml`, plus `workflow_dispatch`. Use this job shape (with separate build and deploy jobs if Pages artifact sharing requires it):

  ```yaml
  name: Deploy documentation
  on:
    push:
      branches: [main]
      paths: ["docs/**", "CHANGELOG.md", ".github/workflows/docs.yml"]
    workflow_dispatch:
  permissions:
    contents: read
    pages: write
    id-token: write
  concurrency:
    group: pages
    cancel-in-progress: false
  jobs:
    deploy:
      runs-on: ubuntu-latest
      environment:
        name: github-pages
        url: ${{ steps.deployment.outputs.page_url }}
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 24
        - run: corepack enable
        - run: yarn --cwd docs install --immutable
        - run: yarn docs:build
        - uses: actions/configure-pages@v4
        - uses: actions/upload-pages-artifact@v3
          with:
            path: docs/.vitepress/dist
        - id: deployment
          uses: actions/deploy-pages@v4
  ```

- [ ] **Step 3: Document exact activation order.** `docs/DEPLOYMENT.md` instructs maintainers to verify `rss2.pub` under the `moreal` GitHub account with GitHub's requested TXT record; set repository Pages source to GitHub Actions and custom domain `docs.rss2.pub`; then create Cloudflare `CNAME docs -> moreal.github.io` in DNS-only mode, wait for HTTPS availability, enable HTTPS, and check both locales. State that the GitHub Actions custom-domain mode does not depend on a checked-in `CNAME` file. Add deployment documentation to release policy.

- [ ] **Step 4: Verify and commit.** Run `yarn --cwd docs install --immutable`, `yarn docs:build`, the root quality gate `yarn typecheck && yarn lint:solid && yarn test`, `git diff --check`, and check that root `yarn.lock` and `flake.nix` have no docs-only changes. Commit Task 3 with exactly one `Assisted-by: Codex:gpt-6-sol` trailer.

### Task 4: Activate and verify the public site

**Files:** No source changes unless live deployment reveals a reproducible build or link defect.

**Interfaces:** Public `https://docs.rss2.pub/` and `https://docs.rss2.pub/ko/` after GitHub Pages and DNS converge.

- [ ] **Step 1: Publish repository commits to `main` and activate Pages.** After code review and local gates, push the commits; use repository admin access to configure Pages with GitHub Actions source and custom domain. Follow `docs/DEPLOYMENT.md` to verify the domain and configure DNS. Never create the DNS CNAME before the Pages custom domain is bound.

- [ ] **Step 2: Check the live result.** Confirm the Pages workflow succeeds, `docs.rss2.pub` resolves to `moreal.github.io`, HTTPS presents the expected certificate, `/` and `/ko/` load, and a guide and changelog page load in each locale. If DNS-provider access is unavailable, stop before changing DNS and report the exact record and settings the owner must apply; do not claim the site is live.
