# Fedify Security Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Fedify dependency family to the latest stable minor release and security patches.

**Architecture:** Keep the existing federation adapters and persistence architecture. Upgrade the dependency graph together to keep vocabulary classes on one package copy; regenerate Nix cache inputs from the lockfile.

**Tech Stack:** Node.js 24, Yarn 4.17.1, Fedify 2.4.1, Vitest, Testcontainers, Nix.

**Spec:** User request in this chat and `AGENTS.md`.

## Global Constraints

- Preserve existing UX changes in the working tree.
- Keep `nodeLinker: pnpm` and the repository's package-manager version.
- Refresh `nix/missing-hashes.json` and `yarnOfflineCache.hash` after changing `yarn.lock`.
- Run `yarn typecheck && yarn lint:solid && yarn test`.

## Review Focus

- Dependency identity: core, CLI and adapters must resolve one vocabulary package.
- Actor discovery and signed Follow/Undo: existing federation E2E coverage must pass.
- Restart persistence: existing keys and object IDs must remain stable.
- Queue compatibility: PostgreSQL delivery tests must pass.
- Nix installation: regenerated offline cache must build successfully.

### Task 1: Upgrade and verify Fedify

**Files:** `package.json`, `yarn.lock`, `AGENTS.md`, `CHANGELOG.md`, `docs/ko/changelog.md`, `nix/missing-hashes.json`, `flake.nix`.

**Interfaces:** Existing Fedify adapters and federation test fixtures; no new public interface.

- [x] Confirm the latest stable versions and upstream release notes from npm and GitHub.
- [x] Set all five direct Fedify dependencies to `~2.4.1`, install, and review the resolved graph.
- [x] Update the tested version guide and bilingual changelog.
- [x] Regenerate missing hashes and offline cache hash using the documented Nix fetcher.
- [x] Run immutable install, typecheck, Solid lint, and the full test suite; fix compatibility issues only if needed.
- [x] Run the Nix build and review the final diff against existing working-tree changes.

Dependency metadata changes use the existing integration regression suite; no new behavior or duplicate dependency tests are introduced. Execute directly under the user's update authorization, leaving changes available for review without committing unrelated work.

## Verification Record

- npm's latest stable releases and the upstream GitHub release both reported 2.4.1 on October 5, 2026.
- Yarn's default 24-hour age gate initially blocked the newly published release. A process-local `YARN_NPM_PREAPPROVED_PACKAGES=@fedify/*` exception allowed this requested security update; no repository policy was changed.
- The immutable install, typecheck, and Solid lint passed. Existing Solid and TypeScript peer-range warnings remain unrelated to Fedify.
- `yarn test` passed: 71 files, 875 Vitest tests, and 14 script tests, with no failures or skips.
- `yarn why` confirmed a single 2.4.1 copy of Vocab and Vocab Runtime.
- Regenerating all 224 missing package hashes produced the existing `nix/missing-hashes.json` unchanged. The new offline cache hash is `sha256-QHYlwszRWLCuO/yaNcG9Hypf2l2ZUcrLKShCrYE70Lk=`.
- `nix build .# --no-link` passed on aarch64-darwin. Final diff review and whitespace checks passed; the original UX edits remain preserved.
