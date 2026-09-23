import { describe, expect, it } from "vitest";
import { createWebUiAssetRoutes, loadWebUiAssets, webUiAssetUrls } from "../../../src/web/ui/solid-assets.js";

describe("web-ui assets", () => {
  it("serves only built JS and CSS with immutable caching", async () => {
    if (webUiAssetUrls === null) throw new Error("Expected the test build to provide browser assets");
    const app = createWebUiAssetRoutes();
    for (const [url, type] of [
      [webUiAssetUrls.script, "text/javascript"],
      [webUiAssetUrls.style, "text/css"],
    ] as const) {
      const response = await app.request(url);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(type);
      expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
      expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
    }
    expect((await app.request("/_assets/web-ui/assets/unknown.js")).status).toBe(404);
  });

  it("keeps the server available when the browser bundle is missing", () => {
    const missing = Object.assign(new Error("missing asset"), { code: "ENOENT" });
    expect(loadWebUiAssets("/missing", () => { throw missing; })).toBeNull();
  });

  it("rejects a manifest that would leave a stylesheet unserved", () => {
    const manifest = new TextEncoder().encode(JSON.stringify({
      "src/client.tsx": { file: "assets/client-a.js", css: ["assets/a.css", "assets/b.css"] },
    }));
    expect(() => loadWebUiAssets("/fixture", () => manifest)).toThrow(/exactly one stylesheet/);
  });
});
