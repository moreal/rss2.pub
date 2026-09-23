import { describe, expect, it, vi } from "vitest";
import {
  fetchPublicUrl,
  resolveConnectionAddress,
} from "../../../../src/infrastructure/feedfetch/public-fetch.js";

describe("fetchPublicUrl", () => {
  it("rejects a private address returned at connection time", async () => {
    const resolve = vi.fn(async () => [{ address: "169.254.169.254", family: 4 }]);
    await expect(resolveConnectionAddress("rebind.example", resolve, false))
      .rejects.toThrow(/private|public/i);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("rejects mixed public and private DNS answers", async () => {
    const resolve = async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ];
    await expect(resolveConnectionAddress("mixed.example", resolve, false))
      .rejects.toThrow(/private|public/i);
  });

  it("selects a verified address for the socket", async () => {
    const resolve = async () => [{ address: "8.8.8.8", family: 4 }];
    await expect(resolveConnectionAddress("public.example", resolve, false))
      .resolves.toEqual({ address: "8.8.8.8", family: 4 });
  });

  it("blocks a private literal before sending a request", async () => {
    const fetchImpl = vi.fn(async () => new Response("secret"));
    await expect(fetchPublicUrl("http://127.0.0.1/private", {}, { fetchImpl }))
      .rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("checks a redirect target before following it", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.redirect("http://127.0.0.1/private", 302)
    );
    await expect(fetchPublicUrl("https://8.8.8.8/feed", {}, { fetchImpl }))
      .rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("permits local fixture requests when explicitly enabled", async () => {
    const fetchImpl = vi.fn(async () => new Response("fixture"));
    const response = await fetchPublicUrl("http://127.0.0.1/feed", {}, {
      allowPrivateAddress: true,
      fetchImpl,
    });
    expect(await response.text()).toBe("fixture");
  });
});
