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
    resolveSubscribeUrl:
      resolve ??
      (async (account) => err({ type: "NoSubscribeTemplate", account })),
  };
}

async function setup(
  remoteFollow?: RemoteFollowResolver,
  feedTitle = "Example Feed",
  articleTitle = "Article title",
  includePosts = true,
) {
  const feeds = createInMemoryFeedRepository();
  const federationObjects = createInMemoryFederationRepository();
  const feed = makeFeed({
    handle: "feed_a",
    title: feedTitle,
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
  if (includePosts)
    await federationObjects.upsertObject({
      id: "post-1",
      actorHandle: feed.handle,
      kind: "article",
      contentHtml:
        "<p>Hello<script>alert(1)</script><strong>world</strong></p><ul><li>First item</li></ul><blockquote><p>a</p><p>b</p></blockquote>",
      name: articleTitle,
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
  if (includePosts)
    await federationObjects.upsertObject({
      id: "post-2",
      actorHandle: feed.handle,
      kind: "note",
      contentHtml:
        '<p><strong>Breaking news</strong></p>\n<p>Something happened today.</p>\n<p><a href="https://source.test/posts/2" rel="nofollow noopener noreferrer">https://source.test/posts/2</a></p>',
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
    expect(html).toContain('onerror="this.remove()"');
    expect(html).toContain("1 follower");
    expect(html).toContain('<p class="feed-meta"><span class="handle">');
    expect(html).toContain("Article title");
    expect(html).toContain("Breaking news");
    expect(html).toContain("Something happened today.");
    expect(html).not.toContain("https://source.test/posts/2");
    expect(html).not.toContain(">Post<");
    expect(html).toContain('class="site-nav"');
    expect(html).toContain('class="site-footer"');

    expect(main.status).toBe(200);
    const mainHtml = await main.text();
    expect(mainHtml).toContain("rss2.pub");
    expect(mainHtml).toContain("<title>rss2.pub</title>");
    expect(html).not.toContain('<nav class="crumbs"');
    expect(mainHtml).not.toContain('<nav class="crumbs"');
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
    expect(html).toContain("<ul><li>First item</li></ul>");
    expect(html).toContain("<blockquote><p>a</p><p>b</p></blockquote>");
    const mainHtml = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
    expect(mainHtml).not.toContain("<script");
    expect(html).toContain("https://source.test/posts/1");
    expect(html).toContain(
      '<time class="quiet" datetime="2026-08-30T00:00:00.000Z">Aug 30, 2026</time>',
    );
    expect(html).toContain('<a href="/@feed_a">Example Feed</a>');
    expect(html).toContain('class="btn btn-secondary"');
    expect(html).not.toContain('<nav class="crumbs"');

    // Content that does not begin with renderer chrome remains untouched.
    expect(html).toContain("<p>Hello<strong>world</strong></p>");
  });

  it("removes embedded Note chrome from previews and message bodies", async () => {
    const { app } = await setup();
    const profile = await app.request("https://local.test/@feed_a", {
      headers: { Accept: "text/html" },
    });
    const message = await app.request("https://local.test/@feed_a/post-2", {
      headers: { Accept: "text/html" },
    });

    const profileHtml = await profile.text();
    expect(profileHtml).toContain('<div class="content"><p>Something happened today.</p></div>');
    expect(profileHtml).not.toContain("https://source.test/posts/2");

    const messageHtml = await message.text();
    const bodyHtml = messageHtml.slice(
      messageHtml.indexOf('<article class="panel actor-post-body">'),
      messageHtml.indexOf("</article>"),
    );
    expect(bodyHtml).toContain("<p>Something happened today.</p>");
    expect(bodyHtml).not.toContain("<strong>Breaking news</strong>");
    expect(bodyHtml).not.toContain(
      '<a href="https://source.test/posts/2" rel="nofollow noopener noreferrer">https://source.test/posts/2</a>',
    );
    expect(bodyHtml).toContain(
      '<a class="btn btn-secondary" href="https://source.test/posts/2">View original</a>',
    );
  });

  it("renders feed titles with ICU braces verbatim", async () => {
    const { app } = await setup(
      undefined,
      "Tips {braces} & <b>x</b>",
      "Story {braces} & details",
    );
    const response = await app.request("https://local.test/@feed_a", {
      headers: { Accept: "text/html" },
    });
    const messageResponse = await app.request(
      "https://local.test/@feed_a/post-1",
      { headers: { Accept: "text/html" } },
    );
    const remoteFollowError = await app.request(
      "https://local.test/@feed_a/remote-follow?acct=not-an-account",
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain(
      "<title>Tips {braces} &amp; &lt;b&gt;x&lt;/b&gt; · rss2.pub</title>",
    );
    expect(html).toContain("<h1>Tips {braces} &amp; &lt;b&gt;x&lt;/b&gt;</h1>");
    expect(messageResponse.status).toBe(200);
    const messageHtml = await messageResponse.text();
    expect(messageHtml).toContain(
      "<title>Story {braces} &amp; details · rss2.pub</title>",
    );
    expect(messageHtml).toContain("<h1>Story {braces} &amp; details</h1>");
    expect(await remoteFollowError.text()).toContain(
      "Back to Tips {braces} &amp; &lt;b&gt;x&lt;/b&gt;",
    );
  });

  it("uses shared navigation and gives remote-follow errors a way back", async () => {
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
    expect(profileHtml).not.toContain('<nav class="crumbs"');
    expect(profileHtml).toContain('action="/@feed_a/remote-follow"');
    expect(profileHtml).toContain('name="acct"');

    const postHtml = await post.text();
    expect(postHtml).not.toContain('<nav class="crumbs"');
    expect(postHtml).toContain('<a href="/@feed_a">Example Feed</a>');

    expect(remoteFollowError.status).toBe(400);
    const errorHtml = await remoteFollowError.text();
    expect(errorHtml).not.toContain('<nav class="crumbs"');
    expect(errorHtml).toContain("<title>Remote follow · rss2.pub</title>");
    expect(errorHtml).toContain("<h1>Remote follow</h1>");
    expect(errorHtml).toContain('class="notice notice-error"');
    expect(errorHtml).toContain('class="btn btn-secondary" href="/@feed_a"');
    expect(errorHtml).toContain("Back to Example Feed");
    expect(errorHtml).toContain(".actor-message-head .form-actions .btn {");
    expect(errorHtml).toContain("white-space: normal; overflow-wrap: anywhere;");
  });

  it("renders a dedicated remote-follow panel and styled post author", async () => {
    const { app } = await setup();
    const profile = await app.request("https://local.test/@feed_a", {
      headers: { Accept: "text/html" },
    });
    const post = await app.request("https://local.test/@feed_a/post-1", {
      headers: { Accept: "text/html" },
    });

    const profileHtml = await profile.text();
    // The remote-follow form is its own labelled panel, not a row crammed
    // into the profile header, and its submit control reads as a button
    // rather than a bare unstyled input.
    expect(profileHtml).toContain('aria-labelledby="remote-follow-heading"');
    expect(profileHtml).toContain('id="remote-follow-heading"');
    expect(profileHtml).toContain('class="btn btn-primary"');
    expect(profileHtml.indexOf("</header>")).toBeLessThan(
      profileHtml.indexOf('aria-labelledby="remote-follow-heading"'),
    );

    const postHtml = await post.text();
    expect(postHtml).toContain('class="actor-author"');
    expect(postHtml).toContain('<a href="/@feed_a">Example Feed</a>');
    expect(postHtml).toContain("@feed_a@local.test");

    // The compact heading size is scoped to the remote-follow component, not
    // global: an unscoped rule would also shrink post titles and sanitized
    // feed content. The shared stylesheet expresses it through the type token.
    expect(profileHtml).toContain(
      ".remote-follow h2 { font-size: var(--text-lg); }",
    );
    expect(profileHtml).toContain(
      ".actor-profile .handle {\n    white-space: normal; overflow: visible; text-overflow: clip;\n    overflow-wrap: anywhere;\n  }",
    );
    expect(profileHtml).toContain(
      ".actor-profile { grid-template-columns: auto minmax(0, 1fr); }",
    );
    expect(profileHtml).toContain(
      ".actor-author-name a:hover, .actor-author-name a:focus-visible {",
    );
    expect(profileHtml).toContain(
      ".actor-post time, .actor-message-head time { font-size: var(--text-sm); }",
    );
    expect(profileHtml).toContain(
      ".content ul, .content ol { padding-inline-start: var(--space-5); }",
    );
    expect(profileHtml).toContain(
      ".content li > * + *, .content blockquote > * + * { margin-top: var(--space-3); }",
    );
    expect(profileHtml).toContain(
      "border-inline-start: 1px solid var(--border);",
    );
    expect(profileHtml).not.toContain("\n  h2 { font-size: var(--text-lg)");
  });

  it("renders the remote-follow form and error page in Korean when ?lang=ko", async () => {
    const { app } = await setup();
    const profile = await app.request("https://local.test/@feed_a?lang=ko", {
      headers: { Accept: "text/html" },
    });
    const remoteFollowError = await app.request(
      "https://local.test/@feed_a/remote-follow?lang=ko&acct=not-an-account",
    );
    const message = await app.request(
      "https://local.test/@feed_a/post-1?lang=ko",
      { headers: { Accept: "text/html" } },
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
    expect(errorHtml).toContain("Example Feed 페이지로 돌아가기");

    const messageHtml = await message.text();
    expect(messageHtml).toContain('<html lang="ko">');
    expect(messageHtml).toContain("원문 보기");
    expect(messageHtml).toContain(
      '<time class="quiet" datetime="2026-08-30T00:00:00.000Z">2026. 8. 30.</time>',
    );
  });

  it("renders the shared empty-state pattern when an actor has no posts", async () => {
    const { app } = await setup(
      undefined,
      "Example Feed",
      "Article title",
      false,
    );
    const response = await app.request("https://local.test/@feed_a", {
      headers: { Accept: "text/html" },
    });

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('class="empty-state"');
    expect(html).toContain("No posts yet");
    expect(html).toContain(
      "Posts appear here after the next poll of the feed.",
    );
    expect(html).not.toContain('<ul class="posts"');
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
        err({ type: "NoSubscribeTemplate", account }),
      ),
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
    expect(prefixed.headers.get("location")).toContain(
      "https://remote.example/",
    );
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
    expect(
      (await app.request("https://local.test/@feed_a/missing")).status,
    ).toBe(404);
    expect(
      (await app.request("https://local.test/@feed_a/followers")).status,
    ).toBe(404);
    expect(
      (
        await app.request("https://local.test/@feed_a", {
          headers: { Accept: "application/activity+json" },
        })
      ).status,
    ).toBe(406);
  });
});
