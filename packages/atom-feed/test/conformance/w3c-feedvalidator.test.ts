import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
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
const GENERATED_MANIFEST = join(
  REPOSITORY_ROOT,
  "packages",
  "atom-feed",
  "test",
  "conformance",
  "w3c-feedvalidator-cases.ts",
);

function runManifestUpdater() {
  return spawnSync(
    process.execPath,
    [UPDATE_SCRIPT, W3C_FEEDVALIDATOR_ROOT, W3C_FEEDVALIDATOR_COMMIT],
    { cwd: REPOSITORY_ROOT, encoding: "utf8" },
  );
}

function scopedCorpusStatus(): string {
  return execFileSync(
    "git",
    [
      "-C",
      W3C_FEEDVALIDATOR_ROOT,
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--",
      "LICENSE",
      "testcases/atom",
    ],
    { encoding: "utf8" },
  ).trim();
}

function assertPathAbsent(path: string): void {
  if (existsSync(path)) throw new Error(`Test probe path already exists: ${path}`);
}

function expectUpdaterToRejectDirtyCorpus(): void {
  const result = runManifestUpdater();
  expect(result.status).toBe(2);
  expect(result.stderr).toContain("dirty W3C Feed Validator corpus");
}

function withPreservedCorpusMutation(mutate: () => void): void {
  const initialStatus = scopedCorpusStatus();
  if (initialStatus.length > 0) {
    throw new Error(`W3C Feed Validator corpus must be clean:\n${initialStatus}`);
  }
  assertPathAbsent(UNTRACKED_FIXTURE);

  const initialFixture = readFileSync(DIRTY_FIXTURE);
  const initialManifest = readFileSync(GENERATED_MANIFEST);
  try {
    mutate();
  } finally {
    execFileSync(
      "git",
      ["-C", W3C_FEEDVALIDATOR_ROOT, "restore", "--staged", "--", DIRTY_FIXTURE_PATH],
    );
    writeFileSync(DIRTY_FIXTURE, initialFixture);
    if (existsSync(UNTRACKED_FIXTURE)) unlinkSync(UNTRACKED_FIXTURE);
    writeFileSync(GENERATED_MANIFEST, initialManifest);

    expect(scopedCorpusStatus()).toBe(initialStatus);
    expect(readFileSync(GENERATED_MANIFEST)).toEqual(initialManifest);
  }
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
    const repositoryManifest = readFileSync(GENERATED_MANIFEST);
    const preexistingManifest = Buffer.concat([repositoryManifest, Buffer.from("\n")]);
    writeFileSync(GENERATED_MANIFEST, preexistingManifest);

    try {
      withPreservedCorpusMutation(() => {
        appendFileSync(DIRTY_FIXTURE, "\n");
        expectUpdaterToRejectDirtyCorpus();
      });

      withPreservedCorpusMutation(() => {
        appendFileSync(DIRTY_FIXTURE, "\n");
        execFileSync("git", ["-C", W3C_FEEDVALIDATOR_ROOT, "add", "--", DIRTY_FIXTURE_PATH]);
        expectUpdaterToRejectDirtyCorpus();
      });

      withPreservedCorpusMutation(() => {
        writeFileSync(UNTRACKED_FIXTURE, readFileSync(DIRTY_FIXTURE));
        expectUpdaterToRejectDirtyCorpus();
      });

      expect(readFileSync(GENERATED_MANIFEST)).toEqual(preexistingManifest);
    } finally {
      writeFileSync(GENERATED_MANIFEST, repositoryManifest);
    }
  });

  it("leaves an existing probe file untouched when its precondition fails", () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "rss2pub-w3c-probe-"));
    const existingProbe = join(temporaryDirectory, "existing.xml");
    const existingBytes = Buffer.from("pre-existing probe bytes");
    writeFileSync(existingProbe, existingBytes);

    try {
      expect(() => assertPathAbsent(existingProbe)).toThrow("Test probe path already exists");
      expect(readFileSync(existingProbe)).toEqual(existingBytes);
    } finally {
      if (existsSync(existingProbe)) unlinkSync(existingProbe);
      rmdirSync(temporaryDirectory);
    }
  });
});
