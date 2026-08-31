import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  actualW3cFeedValidatorCommit,
  assertW3cSubmoduleInitialized,
  listSelectedW3cAtomPaths,
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
});
