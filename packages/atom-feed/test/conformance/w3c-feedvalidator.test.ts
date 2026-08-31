import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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
});
