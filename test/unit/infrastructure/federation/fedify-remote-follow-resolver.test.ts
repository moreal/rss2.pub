import { createFederation, MemoryKvStore } from "@fedify/fedify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteFollowAccount } from "../../../../src/domain/ports/remote-follow-resolver.js";
import { createFedifyRemoteFollowResolver } from "../../../../src/infrastructure/federation/fedify-remote-follow-resolver.js";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/jrd+json" },
  });
}

/** Unwraps a known-valid literal so tests can pass the branded account type. */
function account(raw: string): RemoteFollowAccount {
  const parsed = RemoteFollowAccount.create(raw);
  if (!parsed.ok) throw new Error(`invalid test account: ${raw}`);
  return parsed.value;
}

function resolverFor(origin = "https://local.test") {
  // allowPrivateAddress skips the real DNS lookup Fedify's WebFinger client
  // otherwise performs before every request, which would try to resolve
  // the fake test hostnames used below against the real network.
  const federation = createFederation<void>({
    kv: new MemoryKvStore(),
    allowPrivateAddress: true,
  });
  return createFedifyRemoteFollowResolver({ federation, origin });
}

describe("createFedifyRemoteFollowResolver", () => {
  it("resolves the WebFinger-advertised subscribe URL and expands acct: uri", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      subject: "acct:alice@remote.example",
      links: [
        {
          rel: "http://ostatus.org/schema/1.0/subscribe",
          template: "https://web.remote.example/interact?uri={uri}",
        },
      ],
    }));
    const resolver = resolverFor();

    const result = await resolver.resolveSubscribeUrl(
      account("alice@remote.example"),
      "feed_a@local.test",
    );

    expect(result).toEqual({
      ok: true,
      value: new URL(
        "https://web.remote.example/interact?uri=acct%3Afeed_a%40local.test",
      ),
    });
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe("/.well-known/webfinger");
    expect(requestedUrl.searchParams.get("resource")).toBe(
      "acct:alice@remote.example",
    );
  });

  it("expands every occurrence of the {uri} placeholder", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      links: [
        {
          rel: "http://ostatus.org/schema/1.0/subscribe",
          template: "https://remote.example/sub?a={uri}&b={uri}",
        },
      ],
    }));
    const resolver = resolverFor();

    const result = await resolver.resolveSubscribeUrl(
      account("alice@remote.example"),
      "feed_a@local.test",
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.toString()).toBe(
      "https://remote.example/sub?a=acct%3Afeed_a%40local.test&b=acct%3Afeed_a%40local.test",
    );
  });

  it("fails without redirecting when the template has no {uri} placeholder", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      links: [
        {
          rel: "http://ostatus.org/schema/1.0/subscribe",
          template: "https://remote.example/authorize_interaction",
        },
      ],
    }));
    const resolver = resolverFor();

    const result = await resolver.resolveSubscribeUrl(
      account("alice@remote.example"),
      "feed_a@local.test",
    );

    expect(result).toMatchObject({
      ok: false,
      error: { type: "NoSubscribeTemplate" },
    });
  });

  it("skips a subscribe template that resolves to a non-HTTP(S) redirect", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      links: [
        {
          rel: "http://ostatus.org/schema/1.0/subscribe",
          template: "javascript:alert(1)//{uri}",
        },
      ],
    }));
    const resolver = resolverFor();

    const result = await resolver.resolveSubscribeUrl(
      account("alice@remote.example"),
      "feed_a@local.test",
    );

    expect(result).toMatchObject({ ok: false, error: { type: "NoSubscribeTemplate" } });
  });

  it("falls through an earlier unusable subscribe link to a later usable one", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      links: [
        { rel: "http://ostatus.org/schema/1.0/subscribe", template: "javascript:{uri}" },
        { rel: "http://ostatus.org/schema/1.0/subscribe", template: "https://remote.example/no-placeholder" },
        {
          rel: "http://ostatus.org/schema/1.0/subscribe",
          template: "https://web.remote.example/interact?uri={uri}",
        },
      ],
    }));
    const resolver = resolverFor();

    const result = await resolver.resolveSubscribeUrl(
      account("alice@remote.example"),
      "feed_a@local.test",
    );

    expect(result).toEqual({
      ok: true,
      value: new URL(
        "https://web.remote.example/interact?uri=acct%3Afeed_a%40local.test",
      ),
    });
  });

  it("tolerates a malformed WebFinger body instead of throwing", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ links: { not: "an array" } }));
    const resolver = resolverFor();

    await expect(
      resolver.resolveSubscribeUrl(account("alice@remote.example"), "feed_a@local.test"),
    ).resolves.toMatchObject({ ok: false, error: { type: "NoSubscribeTemplate" } });
  });

  it("skips a link with the right rel but a non-string template", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      links: [{ rel: "http://ostatus.org/schema/1.0/subscribe", template: 42 }],
    }));
    const resolver = resolverFor();

    const result = await resolver.resolveSubscribeUrl(
      account("alice@remote.example"),
      "feed_a@local.test",
    );

    expect(result).toMatchObject({
      ok: false,
      error: { type: "NoSubscribeTemplate" },
    });
  });

  it("returns a typed error when no subscribe link is advertised", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ links: [] }));
    const resolver = resolverFor();

    const result = await resolver.resolveSubscribeUrl(
      account("alice@remote.example"),
      "feed_a@local.test",
    );

    expect(result).toMatchObject({
      ok: false,
      error: { type: "NoSubscribeTemplate", account: "alice@remote.example" },
    });
  });

  it("returns a typed error when the WebFinger request fails", async () => {
    fetchMock.mockResolvedValue(new Response("not found", { status: 404 }));
    const resolver = resolverFor();

    const result = await resolver.resolveSubscribeUrl(
      account("alice@remote.example"),
      "feed_a@local.test",
    );

    expect(result).toMatchObject({
      ok: false,
      error: { type: "NoSubscribeTemplate" },
    });
  });

  it("returns a typed error when the underlying fetch throws (network error)", async () => {
    // Fedify's own WebFinger client (@fedify/webfinger's lookupWebFinger)
    // catches a thrown fetch() and reports it as a resolved "network_error"
    // outcome (resource: null) rather than rethrowing, so this surfaces to
    // the adapter as a null descriptor, not a caught exception.
    fetchMock.mockRejectedValue(new Error("network down"));
    const resolver = resolverFor();

    const result = await resolver.resolveSubscribeUrl(
      account("alice@remote.example"),
      "feed_a@local.test",
    );

    expect(result).toMatchObject({
      ok: false,
      error: { type: "NoSubscribeTemplate", account: "alice@remote.example" },
    });
  });
});
