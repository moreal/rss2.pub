import { access, readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const output = fileURLToPath(new URL("../.vitepress/dist/", import.meta.url));
const origin = "https://docs.rss2.pub";

async function* pages(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = join(directory, entry.name);
    if (entry.isDirectory()) yield* pages(filename);
    else if (entry.name.endsWith(".html")) yield filename;
  }
}

function outputFile(pathname) {
  const name = decodeURIComponent(pathname).replace(/^\//, "");
  if (pathname.endsWith("/")) return join(output, name, "index.html");
  if (extname(name) === "") return join(output, `${name}.html`);
  return join(output, name);
}

const broken = [];
for await (const filename of pages(output)) {
  const html = await readFile(filename, "utf8");
  const page = relative(output, filename);
  const base = new URL(page, `${origin}/`);
  for (const match of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
    const href = match[1];
    if (href === undefined) continue;
    const url = new URL(href.replaceAll("&amp;", "&"), base);
    if (url.origin !== origin) continue;
    const target = outputFile(url.pathname);
    try {
      await access(target);
    } catch {
      broken.push(`${page}: ${href} → ${relative(output, target)}`);
    }
  }
}

if (broken.length > 0) {
  console.error(`Broken documentation links:\n${broken.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("Documentation links resolve in the built site.");
}
