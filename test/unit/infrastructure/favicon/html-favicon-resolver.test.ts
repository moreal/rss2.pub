import { afterEach, expect, it, vi } from "vitest";
import { createHtmlFaviconResolver } from "../../../../src/infrastructure/favicon/html-favicon-resolver.js";

afterEach(() => vi.unstubAllGlobals());

it("refuses a loopback favicon page before fetching", async () => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  const result = await createHtmlFaviconResolver().resolve("http://127.0.0.1/");
  expect(result).toMatchObject({ ok: false, error: { type: "RequestFailed" } });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("cancels a homepage response that exceeds the icon HTML budget", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024 + 1));
    },
    cancel() {
      cancelled = true;
    },
  });
  const fetchImpl = vi.fn(async () => new Response(stream));
  const result = await createHtmlFaviconResolver({
    allowPrivateAddress: true,
    fetchImpl,
  }).resolve("http://127.0.0.1/");
  expect(result).toMatchObject({ ok: false, error: { type: "RequestFailed" } });
  expect(cancelled).toBe(true);
});

it("resolves relative icons against the final redirected homepage", async () => {
  const page = new Response('<link rel="icon" href="/icon.png">', {
    headers: { "content-type": "text/html" },
  });
  Object.defineProperty(page, "url", { value: "https://final.example/blog/" });
  const fetchImpl = vi.fn(async () => page);
  const result = await createHtmlFaviconResolver({
    allowPrivateAddress: true,
    fetchImpl,
  }).resolve("https://original.example/");
  expect(result).toEqual({
    ok: true,
    value: { iconUrl: "https://final.example/icon.png" },
  });
});
