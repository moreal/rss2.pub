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
const ATOM_ROOT = join(W3C_FEEDVALIDATOR_ROOT, "testcases", "atom");
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

export function listSelectedW3cAtomPaths(): readonly string[] {
  assertW3cSubmoduleInitialized();
  if (selectedPaths !== null) return selectedPaths;
  const discovered = walk(ATOM_ROOT)
    .map((path) => relative(ATOM_ROOT, path).split(sep).join("/"))
    .filter((path) => /^[0-9][^/]*\/.+\.xml$/u.test(path))
    .sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
  selectedPaths = discovered;
  return discovered;
}

export function readW3cAtomFixture(relativePath: string): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(
    readW3cAtomFixtureBytes(relativePath),
  );
}

export function readW3cAtomFixtureBytes(relativePath: string): Uint8Array {
  assertW3cSubmoduleInitialized();
  if (!listSelectedW3cAtomPaths().includes(relativePath)) {
    throw new Error(`Unknown selected W3C Atom fixture: ${relativePath}`);
  }
  return readFileSync(join(ATOM_ROOT, relativePath));
}
