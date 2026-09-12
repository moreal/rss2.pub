import { parseRss2, type Rss2ParseResult } from "../../src/index.js";
import type { W3cRss20Case } from "./w3c-feedvalidator-types.js";
import { readW3cRss20Fixture } from "./w3c-feedvalidator-support.js";

export function parseW3cRss20Case(testCase: W3cRss20Case): Rss2ParseResult {
  return parseRss2(readW3cRss20Fixture(testCase.path));
}
