import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { W3C_ATOM_CASES } from "./w3c-feedvalidator-cases.js";
import {
  actualW3cFeedValidatorCommit,
  assertW3cSubmoduleInitialized,
  listSelectedW3cAtomPaths,
  readW3cAtomFixtureBytes,
  W3C_FEEDVALIDATOR_COMMIT,
  W3C_FEEDVALIDATOR_ROOT,
} from "./w3c-feedvalidator-support.js";

const REPOSITORY_ROOT = join(W3C_FEEDVALIDATOR_ROOT, "..", "..");
const UPDATE_SCRIPT = join(REPOSITORY_ROOT, "scripts", "update-w3c-atom-manifest.mjs");
const DIRTY_FIXTURE_PATH = "testcases/atom/8.2/alternate_href_ipv6_literal.xml";
const DIRTY_FIXTURE = join(W3C_FEEDVALIDATOR_ROOT, DIRTY_FIXTURE_PATH);
const UNTRACKED_FIXTURE_PATH = "testcases/atom/8.2/rss2pub-dirty-fixture.xml";
const UNTRACKED_FIXTURE = join(W3C_FEEDVALIDATOR_ROOT, UNTRACKED_FIXTURE_PATH);

function runManifestUpdater() {
  return spawnSync(
    process.execPath,
    [UPDATE_SCRIPT, W3C_FEEDVALIDATOR_ROOT, W3C_FEEDVALIDATOR_COMMIT],
    { cwd: REPOSITORY_ROOT, encoding: "utf8" },
  );
}

function restoreGeneratedManifest(): void {
  const result = runManifestUpdater();
  if (result.status !== 0) {
    throw new Error(`Failed to restore W3C Atom manifest: ${result.stderr}`);
  }
}

function expectUpdaterToRejectDirtyCorpus(): void {
  const result = runManifestUpdater();
  expect(result.status).toBe(2);
  expect(result.stderr).toContain("dirty W3C Feed Validator corpus");
}

describe("W3C Feed Validator Atom corpus", () => {
  it("uses the initialized, licensed, pinned upstream snapshot", () => {
    assertW3cSubmoduleInitialized();
    expect(actualW3cFeedValidatorCommit()).toBe(W3C_FEEDVALIDATOR_COMMIT);
    expect(readFileSync(join(W3C_FEEDVALIDATOR_ROOT, "LICENSE"), "utf8"))
      .toContain("Permission is hereby granted, free of charge");
    expect(listSelectedW3cAtomPaths()).toHaveLength(381);
  });

  it("accounts for every selected fixture exactly once", () => {
    const selected = listSelectedW3cAtomPaths();
    expect(W3C_ATOM_CASES.map((testCase) => testCase.path)).toEqual(selected);
    expect(new Set(W3C_ATOM_CASES.map((testCase) => testCase.path)).size).toBe(381);

    for (const testCase of W3C_ATOM_CASES) {
      expect(
        createHash("sha256")
          .update(readW3cAtomFixtureBytes(testCase.path))
          .digest("hex"),
        testCase.path,
      ).toBe(testCase.sha256);
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

  it("refuses staged, unstaged, and untracked changes in the pinned corpus", () => {
    const originalFixture = readFileSync(DIRTY_FIXTURE);

    try {
      appendFileSync(DIRTY_FIXTURE, "\n");
      expectUpdaterToRejectDirtyCorpus();
    } finally {
      writeFileSync(DIRTY_FIXTURE, originalFixture);
      restoreGeneratedManifest();
    }

    try {
      appendFileSync(DIRTY_FIXTURE, "\n");
      execFileSync("git", ["-C", W3C_FEEDVALIDATOR_ROOT, "add", "--", DIRTY_FIXTURE_PATH]);
      expectUpdaterToRejectDirtyCorpus();
    } finally {
      execFileSync(
        "git",
        ["-C", W3C_FEEDVALIDATOR_ROOT, "restore", "--staged", "--", DIRTY_FIXTURE_PATH],
      );
      writeFileSync(DIRTY_FIXTURE, originalFixture);
      restoreGeneratedManifest();
    }

    try {
      expect(existsSync(UNTRACKED_FIXTURE)).toBe(false);
      writeFileSync(UNTRACKED_FIXTURE, originalFixture);
      expectUpdaterToRejectDirtyCorpus();
    } finally {
      if (existsSync(UNTRACKED_FIXTURE)) unlinkSync(UNTRACKED_FIXTURE);
      restoreGeneratedManifest();
    }
  });
});
