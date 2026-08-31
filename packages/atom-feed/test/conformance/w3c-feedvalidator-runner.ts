import { parseAtom, type AtomParseResult } from "../../src/index.js";
import type { W3cAtomCase } from "./w3c-feedvalidator-types.js";
import { readW3cAtomFixture } from "./w3c-feedvalidator-support.js";

export function parseW3cAtomCase(testCase: W3cAtomCase): AtomParseResult {
  return parseAtom(readW3cAtomFixture(testCase.path));
}
