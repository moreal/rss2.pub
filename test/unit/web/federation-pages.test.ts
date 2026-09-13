import { describe, expect, it } from "vitest";
import { createInMemoryFederationRepository } from "../../../src/infrastructure/persistence/in-memory-federation-repository.js";
import { createInMemoryFeedRepository } from "../../../src/infrastructure/persistence/in-memory-feed-repository.js";
import type {
  RemoteFollowError,
  RemoteFollowResolver,
} from "../../../src/domain/ports/remote-follow-resolver.js";
import { createFederationPages } from "../../../src/web/federation-pages.js";
import { err, ok, type Result } from "../../../src/shared/result.js";
import { makeFeed } from "../../helpers/fakes.js";

function createStubRemoteFollowResolver(
  resolve?: (
    account: string,
    localActorAcct: string,
  ) => Promise<Result<URL, RemoteFollowError>>,
): RemoteFollowResolver {
  return {
    resolveSubscribeUrl: resolve
      ?? (async (account) => err({ type: "NoSubscribeTemplate", account })),
  };
}

async function setup(remoteFollow?: RemoteFollowResolver) {
  const feeds = createInMemoryFeedRepository();
  const federationObjects = createInMemoryFederationRepository();
  const feed = makeFeed({
    handle: "feed_a",
    title: "Example Feed",
    description: "A useful feed",
    iconUrl: "https://source.test/icon.png",
    url: "https://source.test/feed.xml",
  });
  await feeds.save(feed);
  await federationObjects.addFollower({
    localHandle: feed.handle,
    actorUri: "https://remote.test/users/alice",
    inboxUri: "https://remote.test/users/alice/inbox",
    sharedInboxUri: null,
    followedAt: new Date("2026-08-30T00:00:00Z"),
  });
  await federationObjects.upsertObject({
    id: "post-1",
    actorHandle: feed.handle,
    kind: "article",
    contentHtml: "<p>Hello<script>alert(1)</script><strong>world</strong></p>",
    name: "Article title",
    summaryHtml: "<p>Short summary</p>",
    sourceUrl: "https://source.test/posts/1",
    language: "en",
    toUris: ["https://www.w3.org/ns/activitystreams#Public"],
    ccUris: [],
    attributedToUris: ["https://local.test/ap/actor/feed_a"],
    mentions: [],
    publishedAt: new Date("2026-08-30T00:00:00Z"),
    updatedAt: null,
  });
  await federationObjects.upsertObject({
    id: "post-2",
    actorHandle: feed.handle,
    kind: "note",
    contentHtml: "<p><strong>Breaking news</strong></p>\n<p>Something happened today.</p>",
    name: "Breaking news",
    summaryHtml: null,
    sourceUrl: "https://source.test/posts/2",
    language: "en",
    toUris: ["https://www.w3.org/ns/activitystreams#Public"],
    ccUris: [],
    attributedToUris: ["https://local.test/ap/actor/feed_a"],
    mentions: [],
    publishedAt: new Date("2026-08-31T00:00:00Z"),
    updatedAt: null,
  });
  return {
    app: createFederationPages({
      origin: "https://local.test",
      feeds,
      federationObjects,
      remoteFollow: remoteFollow ?? createStubRemoteFollowResolver(),
    }),
  };
}

describe("createFederationPages", () => {
  it("renders feed and main actor profiles with public metadata", async () => {
    const { app } = await setup();
    const feed = await app.request("https://local.test/@feed_a", {
      headers: { Accept: "text/html" },
    });
    const main = await app.request("https://local.test/@rss2pub", {
      headers: { Accept: "text/html" },
    });

    expect(feed.status).toBe(200);
    const html = await feed.text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("Example Feed");
    expect(html).toContain("@feed_a@local.test");
    expect(html).toContain("A useful feed");
    expect(html).toContain("https://source.test/feed.xml");
    expect(html).toContain("https://source.test/icon.png");
    expect(html).toContain("1 follower");
    expect(html).toContain("Article title");
    expect(html).toContain("Breaking news");
    expect(html).toContain("Something happened today.");
    expect(html).not.toContain(">Post<");

    expect(main.status).toBe(200);
    expect(await main.text()).toContain("rss2.pub");
  });

  it("renders sanitized Note/Article message pages and source links", async () => {
    const { app } = await setup();
    const response = await app.request("https://local.test/@feed_a/post-1", {
      headers: { Accept: "text/html" },
    });

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("Article title");
    expect(html).toContain("Short summary");
    expect(html).toContain("<strong>world</strong>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("https://source.test/posts/1");
    expect(html).toContain("2026-08-30");
  });

  it("links back to the root page from the profile, message, and remote-follow error pages", async () => {
    const { app } = await setup();
    const profile = await app.request("https://local.test/@feed_a", {
      headers: { Accept: "text/html" },
    });
    const post = await app.request("https://local.test/@feed_a/post-1", {
      headers: { Accept: "text/html" },
    });
    const remoteFollowError = await app.request(
      "https://local.test/@feed_a/remote-follow?acct=not-an-account",
    );

    const profileHtml = await profile.text();
    expect(profileHtml).toContain('<a href="/">rss2.pub</a>');
    expect(profileHtml).toContain('action="/@feed_a/remote-follow"');
    expect(profileHtml).toContain('name="acct"');

    const postHtml = await post.text();
    expect(postHtml).toContain('<a href="/">rss2.pub</a>');

    expect(remoteFollowError.status).toBe(400);
    expect(await remoteFollowError.text()).toContain('<a href="/">rss2.pub</a>');
  });

  it("renders the remote-follow form and error page in Korean when ?lang=ko", async () => {
    const { app } = await setup();
    const profile = await app.request("https://local.test/@feed_a?lang=ko", {
      headers: { Accept: "text/html" },
    });
    const remoteFollowError = await app.request(
      "https://local.test/@feed_a/remote-follow?lang=ko&acct=not-an-account",
    );

    const profileHtml = await profile.text();
    expect(profileHtml).toContain('<html lang="ko">');
    expect(profileHtml).toContain("내 페디버스 계정으로 팔로우하기");
    expect(profileHtml).toContain("팔로우</button>");
    expect(profileHtml).toContain("아이디@인스턴스.example");

    expect(remoteFollowError.status).toBe(400);
    const errorHtml = await remoteFollowError.text();
    expect(errorHtml).toContain('<html lang="ko">');
    expect(errorHtml).toContain("원격 팔로우");
    expect(errorHtml).toContain("올바른 페디버스 계정을 입력하세요");
  });

  it("negotiates locale from a cookie/header and preserves it in the rendered form action", async () => {
    const { app } = await setup();
    const viaCookie = await app.request("https://local.test/@feed_a", {
      headers: { Cookie: "lang=ko" },
    });
    const viaHeader = await app.request("https://local.test/@feed_a", {
      headers: { "Accept-Language": "ko-KR,ko;q=0.9" },
    });

    const cookieHtml = await viaCookie.text();
    expect(cookieHtml).toContain("내 페디버스 계정으로 팔로우하기");
    const headerHtml = await viaHeader.text();
    expect(headerHtml).toContain("내 페디버스 계정으로 팔로우하기");

    // The rendered profile carries its resolved locale forward as a hidden
    // field, so following the on-page form does not silently drop back to
    // English even though the follow-up GET's own query string never
    // mentions ?lang= itself.
    expect(cookieHtml).toContain('name="lang" value="ko"');
    expect(cookieHtml).toContain('<html lang="ko">');
  });

  it("redirects to a WebFinger-discovered subscribe URL when the resolver finds one", async () => {
    const seenCalls: Array<[string, string]> = [];
    const { app } = await setup(
      createStubRemoteFollowResolver(async (account, localActorAcct) => {
        seenCalls.push([account, localActorAcct]);
        return ok(
          new URL(
            `https://web.remote.example/interact?uri=${encodeURIComponent(`acct:${localActorAcct}`)}`,
          ),
        );
      }),
    );

    const response = await app.request(
      "https://local.test/@feed_a/remote-follow?acct=alice%40remote.example",
      { redirect: "manual" },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://web.remote.example/interact?uri=acct%3Afeed_a%40local.test",
    );
    expect(seenCalls).toEqual([["alice@remote.example", "feed_a@local.test"]]);
  });

  it("falls back to guessing authorize_interaction when the resolver finds no subscribe template", async () => {
    const { app } = await setup(
      createStubRemoteFollowResolver(async (account) =>
        err({ type: "NoSubscribeTemplate", account })),
    );

    const response = await app.request(
      "https://local.test/@feed_a/remote-follow?acct=alice%40remote.example",
      { redirect: "manual" },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://remote.example/authorize_interaction?uri=acct%3Afeed_a%40local.test",
    );
  });

  it("accepts an @-prefixed account for remote-follow", async () => {
    const { app } = await setup();
    const prefixed = await app.request(
      "https://local.test/@feed_a/remote-follow?acct=%40alice%40remote.example",
      { redirect: "manual" },
    );

    expect(prefixed.status).toBe(302);
    expect(prefixed.headers.get("location")).toContain("https://remote.example/");
  });

  it("rejects a bare domain or invalid remote-follow account without redirecting", async () => {
    const { app } = await setup();
    const missing = await app.request(
      "https://local.test/@feed_a/remote-follow",
      { redirect: "manual" },
    );
    const bareDomain = await app.request(
      "https://local.test/@feed_a/remote-follow?acct=remote.example",
      { redirect: "manual" },
    );
    const malformed = await app.request(
      "https://local.test/@feed_a/remote-follow?acct=not a domain",
      { redirect: "manual" },
    );
    const unknownActor = await app.request(
      "https://local.test/@missing/remote-follow?acct=alice%40remote.example",
      { redirect: "manual" },
    );
    const trailingNul = await app.request(
      "https://local.test/@feed_a/remote-follow?acct=alice%40remote.example%00",
      { redirect: "manual" },
    );
    const trailingBackslash = await app.request(
      "https://local.test/@feed_a/remote-follow?acct=alice%40remote.example%5C",
      { redirect: "manual" },
    );
    const nulInLocalPart = await app.request(
      "https://local.test/@feed_a/remote-follow?acct=alice%00bob%40remote.example",
      { redirect: "manual" },
    );

    expect(missing.status).toBe(400);
    expect(bareDomain.status).toBe(400);
    expect(malformed.status).toBe(400);
    expect(unknownActor.status).toBe(404);
    expect(trailingNul.status).toBe(400);
    expect(trailingBackslash.status).toBe(400);
    expect(nulInLocalPart.status).toBe(400);
  });

  it("normalizes an internationalized domain name in a remote-follow account", async () => {
    const seenAccounts: string[] = [];
    const { app } = await setup(
      createStubRemoteFollowResolver(async (account) => {
        seenAccounts.push(account);
        return err({ type: "NoSubscribeTemplate", account });
      }),
    );

    const response = await app.request(
      `https://local.test/@feed_a/remote-follow?acct=${encodeURIComponent("alice@예시.테스트")}`,
      { redirect: "manual" },
    );

    expect(seenAccounts).toEqual(["alice@xn--vv4b11d.xn--9t4b11yi5a"]);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://xn--vv4b11d.xn--9t4b11yi5a/authorize_interaction?uri=acct%3Afeed_a%40local.test",
    );
  });

  it("returns 404 for unknown/reserved paths and negotiates HTML only", async () => {
    const { app } = await setup();

    expect((await app.request("https://local.test/@missing")).status).toBe(404);
    expect((await app.request("https://local.test/@feed_a/missing")).status)
      .toBe(404);
    expect((await app.request("https://local.test/@feed_a/followers")).status)
      .toBe(404);
    expect((await app.request("https://local.test/@feed_a", {
      headers: { Accept: "application/activity+json" },
    })).status).toBe(406);
  });
});
