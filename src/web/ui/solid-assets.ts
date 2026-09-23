import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { Hono } from "hono";

const require = createRequire(import.meta.url);
const serverEntry = require.resolve("@rss2pub/web-ui/server");
const clientDir = resolve(dirname(serverEntry), "../client");

type ManifestEntry = { readonly file: string; readonly css: readonly string[] };

function manifestEntry(value: unknown): ManifestEntry {
  if (typeof value !== "object" || value === null || !("src/client.tsx" in value)) {
    throw new Error("web-ui client manifest is missing its entry");
  }
  const entry = value["src/client.tsx"];
  if (typeof entry !== "object" || entry === null || !("file" in entry) || !("css" in entry) ||
      typeof entry.file !== "string" || !Array.isArray(entry.css) ||
      !entry.css.every((file: unknown) => typeof file === "string")) {
    throw new Error("web-ui client manifest has an invalid entry");
  }
  if (entry.css.length !== 1) {
    throw new Error("web-ui client manifest must contain exactly one stylesheet");
  }
  return { file: entry.file, css: entry.css };
}

type Asset = { readonly url: string; readonly bytes: Uint8Array; readonly type: string };
type BrowserAssets = { readonly script: Asset; readonly style: Asset };
type ReadAsset = (path: string) => Uint8Array;

function asset(clientDir: string, file: string, extension: "js" | "css", type: string, read: ReadAsset): Asset {
  if (!new RegExp(`^assets/[a-zA-Z0-9_-]+\\.${extension}$`).test(file)) {
    throw new Error(`Invalid web-ui asset name: ${file}`);
  }
  return {
    url: `/_assets/web-ui/${file}`,
    bytes: read(resolve(clientDir, file)),
    type,
  };
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** Browser enhancement is optional; the server-rendered native picker remains usable. */
export function loadWebUiAssets(directory: string, read: ReadAsset = readFileSync): BrowserAssets | null {
  try {
    const manifest: unknown = JSON.parse(new TextDecoder().decode(read(resolve(directory, ".vite/manifest.json"))));
    const entry = manifestEntry(manifest);
    const cssFile = entry.css[0];
    if (cssFile === undefined) throw new Error("web-ui client CSS is missing");
    return {
      script: asset(directory, entry.file, "js", "text/javascript; charset=utf-8", read),
      style: asset(directory, cssFile, "css", "text/css; charset=utf-8", read),
    };
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

const browserAssets = loadWebUiAssets(clientDir);
export const webUiAssetUrls = browserAssets === null
  ? null
  : { script: browserAssets.script.url, style: browserAssets.style.url };

export function createWebUiAssetRoutes(): Hono {
  const app = new Hono();
  for (const item of browserAssets === null ? [] : [browserAssets.script, browserAssets.style]) {
    app.get(item.url, () => new Response(item.bytes, {
      headers: {
        "Content-Type": item.type,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    }));
  }
  return app;
}
