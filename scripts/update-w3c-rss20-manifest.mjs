import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_PATHS = new Set([
  "data-types-datetime/everything.xml",
  "element-channel-item-category/blank_category.xml",
  "element-channel-item-enclosure/item_enclosure_zero_length.xml",
  "introduction/rss-2.0-sample-noerror.xml",
  "namespace-elements-content-encoded/content_before_description.xml",
]);

const BOUNDARY_ERRORS = new Map([
  ["data-types-characterdata/amp-HEX-upper.xml", "MalformedXml"],
  ["data-types-characterdata/amp-hex-name.xml", "MalformedXml"],
  ["element-rss/missing_channel.xml", "NotRss2Feed"],
  ["element-rss/missing_version_attribute.xml", "NotRss2Feed"],
]);

const UNCONSUMED_DIRECTORY_PATTERN = /^(?:namespace-elements-(?:atom-link|slash-comments))/u;
const EXPECTATION_PATTERN = /Expect:\s*([^\r\n]+)/u;
const ROOT_PATTERN = /<([A-Za-z_][A-Za-z0-9_.-]*:)?([A-Za-z_][A-Za-z0-9_.-]*)(?=[\s/>])/u;
const SELECTED_PATH_PATTERN = /^.+\.xml$/u;
const FULL_COMMIT_PATTERN = /^[0-9a-f]{40}$/iu;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function bytewiseCompare(left, right) {
  return Buffer.from(left).compare(Buffer.from(right));
}

function rootKindOf(xml) {
  const withoutComments = xml.replace(/<!--[\s\S]*?-->/gu, "");
  const match = ROOT_PATTERN.exec(withoutComments);
  return match?.[1] === undefined && match?.[2] === "rss" ? "rss" : "other";
}

function notApplicableReason(path) {
  if (UNCONSUMED_DIRECTORY_PATTERN.test(path)) {
    return "unconsumed-element";
  }
  return "validator-only-semantic-rule";
}

function classify({ path, expectation, rootKind }) {
  if (PROJECT_PATHS.has(path)) {
    return { classification: "project", reason: "dto-projection" };
  }
  const boundaryError = BOUNDARY_ERRORS.get(path);
  if (boundaryError !== undefined) {
    return {
      classification: "reject",
      reason: "parser-boundary",
      expectedError: boundaryError,
    };
  }
  if (expectation === "!Error" && rootKind === "rss") {
    return { classification: "accept", reason: "upstream-no-error-rss20" };
  }
  return {
    classification: "not-applicable",
    reason: notApplicableReason(path),
  };
}

function main() {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length !== 2) {
    fail("usage: update-w3c-rss20-manifest.mjs <submodule-path> <full-commit>");
  }

  const [submoduleArgument, expectedCommit] = arguments_;
  if (submoduleArgument === undefined
    || expectedCommit === undefined
    || !FULL_COMMIT_PATTERN.test(expectedCommit)) {
    fail("expected a submodule path and a full 40-character commit");
  }

  const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const submodulePath = resolve(repositoryRoot, submoduleArgument);
  if (!existsSync(join(submodulePath, "LICENSE"))) {
    fail(`missing W3C Feed Validator license: ${join(submodulePath, "LICENSE")}`);
  }

  let actualCommit;
  try {
    actualCommit = execFileSync("git", ["-C", submodulePath, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    fail(`cannot read W3C Feed Validator HEAD: ${submodulePath}`);
  }
  if (actualCommit !== expectedCommit) {
    fail(`wrong W3C Feed Validator HEAD: expected ${expectedCommit}, got ${actualCommit}`);
  }

  let relevantStatus;
  try {
    relevantStatus = execFileSync(
      "git",
      [
        "-C",
        submodulePath,
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
        "--",
        "LICENSE",
        "testcases/rss20",
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    ).trim();
  } catch {
    fail(`cannot inspect W3C Feed Validator corpus status: ${submodulePath}`);
  }
  if (relevantStatus.length > 0) {
    fail(`dirty W3C Feed Validator corpus:\n${relevantStatus}`);
  }

  const rss20Root = join(submodulePath, "testcases", "rss20");
  let paths;
  try {
    paths = walk(rss20Root)
      .map((path) => relative(rss20Root, path).split(sep).join("/"))
      .filter((path) => SELECTED_PATH_PATTERN.test(path))
      .sort(bytewiseCompare);
  } catch {
    fail(`cannot enumerate W3C RSS 2.0 corpus: ${rss20Root}`);
  }
  if (paths.length !== 326) {
    fail(`expected 326 selected W3C RSS 2.0 fixtures, found ${paths.length}`);
  }

  const cases = paths.map((path) => {
    const bytes = readFileSync(join(rss20Root, path));
    const xml = bytes.toString("utf8");
    const expectation = EXPECTATION_PATTERN.exec(xml)?.[1]?.trim();
    if (expectation === undefined || expectation.length === 0) {
      fail(`missing Expect: comment: ${path}`);
    }
    const rootKind = rootKindOf(xml);
    return {
      path,
      feature: path.slice(0, path.indexOf("/")),
      upstreamExpectation: expectation,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      rootKind,
      ...classify({ path, expectation, rootKind }),
    };
  });

  const outputPath = join(
    repositoryRoot,
    "packages",
    "rss-feed",
    "test",
    "conformance",
    "w3c-feedvalidator-cases.ts",
  );
  const generated = [
    "// Generated by scripts/update-w3c-rss20-manifest.mjs; do not edit.",
    'import type { W3cRss20Case } from "./w3c-feedvalidator-types.js";',
    "",
    `export const W3C_RSS20_CASES = ${JSON.stringify(cases, null, 2)} as const satisfies readonly W3cRss20Case[];`,
    "",
  ].join("\n");

  writeFileSync(outputPath, generated);
}

try {
  main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
