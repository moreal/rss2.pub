import assert from "node:assert/strict";
import { test } from "node:test";
import { validateRelease } from "./check-release.mjs";

const packages = ["0.1.0", "0.1.0", "0.1.0", "0.1.0"];
const changelog = "## [0.1.0] - 2026-09-23\n\n- First release.\n";

test("accepts a matching stable release tag, packages, and changelog", () => {
  assert.deepEqual(validateRelease("v0.1.0", packages, changelog), []);
});

test("rejects a tag that disagrees with any workspace", () => {
  assert.match(validateRelease("v0.1.0", ["0.1.0", "0.0.0"], changelog).join("\n"), /0\.0\.0/);
});

test("rejects an undated or missing changelog entry", () => {
  assert.match(validateRelease("v0.1.0", packages, "## [Unreleased]\n").join("\n"), /Changelog/);
});

test("rejects non-release tags", () => {
  assert.match(validateRelease("v0.1.0-rc.1", packages, changelog).join("\n"), /tag/);
});
