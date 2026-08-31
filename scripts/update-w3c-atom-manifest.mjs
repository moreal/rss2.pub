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
  "1.1/brief-noerror.xml",
  "1.1/extensive-noerror.xml",
  "1.2/prefixed-namespace.xml",
  "2/infoset-cdata.xml",
  "2/infoset-char-ref.xml",
  "2/xml-lang.xml",
  "2/xml-lang-blank.xml",
  "3.1.1.1/example_text_title.xml",
  "3.1.1.2/example_html_title.xml",
  "3.1.1.3/example_xhtml_summary2.xml",
  "3.1.1.3/example_xhtml_summary3.xml",
  "3.1.1.3/missing_xhtml_div.xml",
  "3.1.1.3/missing_xhtml_ns.xml",
  "3.1.1.3/wrong_namespace_for_xhtml_div.xml",
  "3.3/published_fractional_second.xml",
  "4.1.1/author-at-feed-and-entry.xml",
  "4.1.1/author-at-feed-only.xml",
  "4.1.3.2/content-src-no-type-no-error.xml",
  "4.2.11/multiple-authors.xml",
]);

const BOUNDARY_ERRORS = new Map([
  ["1.2/missing-namespace.xml", "NotAtomFeed"],
  ["1.2/wrong-namespace-case.xml", "NotAtomFeed"],
  ["1.2/wrong-namespace.xml", "NotAtomFeed"],
  ["2/brief-entry-noerror.xml", "NotAtomFeed"],
  ["3.1.1.3/xhtml_named_entity.xml", "MalformedXml"],
  ["6.1/invalid-namespace.xml", "MalformedXml"],
]);

const EXPECTATION_PATTERN = /Expect:\s*([^\r\n]+)/u;
const ROOT_PATTERN = /<(?:[A-Za-z_][A-Za-z0-9_.-]*:)?(feed|entry)(?=[\s/>])/u;
const SELECTED_PATH_PATTERN = /^[0-9][^/]*\/.+\.xml$/u;
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
  return ROOT_PATTERN.exec(withoutComments)?.[1];
}

function notApplicableReason(path) {
  if (/^(?:6\.1|6\.4|8\.1|8\.2)\//u.test(path)) {
    return "extension-or-security-warning";
  }
  if (/^(?:4\.2\.2|4\.2\.4|4\.2\.5|4\.2\.8|4\.2\.10|4\.2\.11)\//u.test(path)) {
    return "unconsumed-element";
  }
  if (path.includes("xml-base")
    || /^(?:4\.2\.7\.1\/link-href-relative|4\.2\.7\.2\/link-rel-self)/u.test(path)) {
    return "requires-document-uri-resolution";
  }
  return "validator-only-semantic-rule";
}

function classify({ path, expectation, rootKind }) {
  if (PROJECT_PATHS.has(path)) {
    return { classification: "project", reason: "dto-projection" };
  }
  if (rootKind === "entry") {
    return {
      classification: "reject",
      reason: "product-rejects-entry-document",
      expectedError: "NotAtomFeed",
    };
  }
  const boundaryError = BOUNDARY_ERRORS.get(path);
  if (boundaryError !== undefined) {
    return {
      classification: "reject",
      reason: "parser-boundary",
      expectedError: boundaryError,
    };
  }
  if (expectation === "!Error" && rootKind === "feed") {
    return { classification: "accept", reason: "upstream-no-error-feed" };
  }
  return {
    classification: "not-applicable",
    reason: notApplicableReason(path),
  };
}

function main() {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length !== 2) {
    fail("usage: update-w3c-atom-manifest.mjs <submodule-path> <full-commit>");
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
        "testcases/atom",
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

  const atomRoot = join(submodulePath, "testcases", "atom");
  let paths;
  try {
    paths = walk(atomRoot)
      .map((path) => relative(atomRoot, path).split(sep).join("/"))
      .filter((path) => SELECTED_PATH_PATTERN.test(path))
      .sort(bytewiseCompare);
  } catch {
    fail(`cannot enumerate W3C Atom corpus: ${atomRoot}`);
  }
  if (paths.length !== 381) {
    fail(`expected 381 selected W3C Atom fixtures, found ${paths.length}`);
  }

  const cases = paths.map((path) => {
    const bytes = readFileSync(join(atomRoot, path));
    const xml = bytes.toString("utf8");
    const expectation = EXPECTATION_PATTERN.exec(xml)?.[1]?.trim();
    if (expectation === undefined || expectation.length === 0) {
      fail(`missing Expect: comment: ${path}`);
    }
    const rootKind = rootKindOf(xml);
    if (rootKind === undefined) {
      fail(`unclassifiable Atom root: ${path}`);
    }
    return {
      path,
      rfcSection: path.slice(0, path.indexOf("/")),
      upstreamExpectation: expectation,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      rootKind,
      ...classify({ path, expectation, rootKind }),
    };
  });

  const outputPath = join(
    repositoryRoot,
    "packages",
    "atom-feed",
    "test",
    "conformance",
    "w3c-feedvalidator-cases.ts",
  );
  const generated = [
    "// Generated by scripts/update-w3c-atom-manifest.mjs; do not edit.",
    'import type { W3cAtomCase } from "./w3c-feedvalidator-types.js";',
    "",
    `export const W3C_ATOM_CASES = ${JSON.stringify(cases, null, 2)} as const satisfies readonly W3cAtomCase[];`,
    "",
  ].join("\n");

  writeFileSync(outputPath, generated);
}

try {
  main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
