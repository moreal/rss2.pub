import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const manifests = [
  "package.json",
  "packages/atom-feed/package.json",
  "packages/rss-feed/package.json",
  "packages/web-ui/package.json",
];

export function validateRelease(tag, versions, changelog) {
  const errors = [];
  const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag);
  if (match === null) {
    errors.push(`release tag must be a stable vMAJOR.MINOR.PATCH tag: ${tag}`);
    return errors;
  }
  const version = tag.slice(1);
  for (const [index, actual] of versions.entries()) {
    if (actual !== version) {
      errors.push(`${manifests[index] ?? `package ${index}`}: expected ${version}, got ${actual}`);
    }
  }
  const heading = new RegExp(`^## \\[${version.replaceAll(".", "\\.")}\\] - \\d{4}-\\d{2}-\\d{2}$`, "m");
  if (!heading.test(changelog)) {
    errors.push(`Changelog needs a dated ## [${version}] - YYYY-MM-DD section`);
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? "";
  const versions = manifests.map((path) =>
    JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8")).version
  );
  const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
  const errors = validateRelease(tag, versions, changelog);
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log(`Release ${tag} metadata is consistent.`);
  }
}
