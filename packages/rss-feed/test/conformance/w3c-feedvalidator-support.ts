import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const W3C_FEEDVALIDATOR_COMMIT =
  "9ce274c9db93796b8ab2a44952b9da80811bf765";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
export const W3C_FEEDVALIDATOR_ROOT = join(
  REPOSITORY_ROOT,
  "vendor",
  "w3c-feedvalidator",
);
const RSS20_ROOT = join(W3C_FEEDVALIDATOR_ROOT, "testcases", "rss20");
const INITIALIZE_COMMAND =
  "git submodule update --init --depth 1 vendor/w3c-feedvalidator";
let selectedPaths: readonly string[] | null = null;

export function assertW3cSubmoduleInitialized(): void {
  if (!existsSync(join(W3C_FEEDVALIDATOR_ROOT, "LICENSE"))) {
    throw new Error(`W3C Feed Validator submodule is missing; run: ${INITIALIZE_COMMAND}`);
  }
}

export function actualW3cFeedValidatorCommit(): string {
  assertW3cSubmoduleInitialized();
  return execFileSync("git", ["-C", W3C_FEEDVALIDATOR_ROOT, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

export function listSelectedW3cRss20Paths(): readonly string[] {
  assertW3cSubmoduleInitialized();
  if (selectedPaths !== null) return selectedPaths;
  const discovered = walk(RSS20_ROOT)
    .map((path) => relative(RSS20_ROOT, path).split(sep).join("/"))
    .filter((path) => /^.+\.xml$/u.test(path))
    .sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
  selectedPaths = discovered;
  return discovered;
}

export function readW3cRss20Fixture(relativePath: string): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(
    readW3cRss20FixtureBytes(relativePath),
  );
}

export function readW3cRss20FixtureBytes(relativePath: string): Uint8Array {
  assertW3cSubmoduleInitialized();
  if (!listSelectedW3cRss20Paths().includes(relativePath)) {
    throw new Error(`Unknown selected W3C RSS 2.0 fixture: ${relativePath}`);
  }
  return readFileSync(join(RSS20_ROOT, relativePath));
}
