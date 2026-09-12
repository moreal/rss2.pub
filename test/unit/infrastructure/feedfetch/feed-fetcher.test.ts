import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedUrl } from "../../../../src/domain/feed/feed-url.js";
import { createFeedFetcher } from "../../../../src/infrastructure/feedfetch/feed-fetcher.js";
import { unwrap } from "../../../helpers/result.js";

const parseAtomMock = vi.hoisted(() =>
  vi.fn<typeof import("@rss2pub/atom-feed").parseAtom>(),
);
const parseRss2Mock = vi.hoisted(() =>
  vi.fn<typeof import("@rss2pub/rss-feed").parseRss2>(),
);

vi.mock("@rss2pub/atom-feed", async () => {
  const actual = await vi.importActual<typeof import("@rss2pub/atom-feed")>(
    "@rss2pub/atom-feed",
  );
  parseAtomMock.mockImplementation(actual.parseAtom);
  return { ...actual, parseAtom: parseAtomMock };
});
vi.mock("@rss2pub/rss-feed", async () => {
  const actual = await vi.importActual<typeof import("@rss2pub/rss-feed")>(
    "@rss2pub/rss-feed",
  );
  parseRss2Mock.mockImplementation(actual.parseRss2);
  return { ...actual, parseRss2: parseRss2Mock };
});

const ATOM_XML = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en">
  <id>urn:feed:1</id>
  <title>Feed title</title>
  <subtitle>Feed summary</subtitle>
  <link rel="alternate" href="https://example.test/"/>
  <author><name>Feed author</name><uri>https://actors.test/feed</uri></author>
  <entry xml:lang="ko">
    <id>urn:entry:1</id>
    <link rel="alternate" href="https://example.test/one"/>
    <title>Entry one</title>
    <content type="html">&lt;p&gt;Hello&lt;/p&gt;</content>
    <summary>Short</summary>
    <published>2026-08-29T00:00:00Z</published>
    <updated>2026-08-30T00:00:00Z</updated>
    <author><name>Entry A</name><uri>https://actors.test/a</uri></author>
    <author><name>Name only</name></author>
    <author><name>Entry B</name><uri>https://actors.test/b</uri></author>
  </entry>
</feed>`;

const feedUrl = unwrap(FeedUrl.create("https://example.test/feed.xml"));
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  parseAtomMock.mockClear();
  parseRss2Mock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createFeedFetcher", () => {
  it("maps Atom DTO fields and validators", async () => {
    fetchMock.mockResolvedValue(
      new Response(ATOM_XML, {
        headers: {
          etag: '"v1"',
          "last-modified": "Sun, 30 Aug 2026 00:00:00 GMT",
        },
      }),
    );

    const result = await createFeedFetcher().fetch(feedUrl, {
      etag: null,
      lastModified: null,
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: "fetched",
        feed: {
          title: "Feed title",
          description: "Feed summary",
          link: "https://example.test/",
          language: "en",
          items: [
            {
              guid: "urn:entry:1",
              link: "https://example.test/one",
              title: "Entry one",
              contentHtml: "<p>Hello</p>",
              summaryHtml: "Short",
              publishedAt: new Date("2026-08-29T00:00:00Z"),
              language: "ko",
              authorUris: [
                "https://actors.test/a",
                "https://actors.test/b",
              ],
            },
          ],
        },
        validators: {
          etag: '"v1"',
          lastModified: "Sun, 30 Aug 2026 00:00:00 GMT",
        },
      },
    });
    expect(parseRss2Mock).not.toHaveBeenCalled();
  });

  it("uses plain display text and preserves safe-to-sanitize HTML semantics", async () => {
    const body = `<feed xmlns="http://www.w3.org/2005/Atom">
      <title type="html">A &lt;em&gt;feed&lt;/em&gt;</title>
      <subtitle type="html">A &lt;strong&gt;summary&lt;/strong&gt;</subtitle>
      <entry>
        <id>urn:text</id>
        <title type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml">An <em>entry</em></div></title>
        <summary>5 &lt; 6 &amp; 7 &gt; 3</summary>
      </entry>
      <entry>
        <id>urn:xhtml</id>
        <content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>Hello <em>there</em></p></div></content>
      </entry>
    </feed>`;
    fetchMock.mockResolvedValue(new Response(body));

    const result = await createFeedFetcher().fetch(feedUrl, {
      etag: null,
      lastModified: null,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        status: "fetched",
        feed: {
          title: "A feed",
          description: "A summary",
          link: null,
          language: null,
          items: [
            {
              guid: "urn:text",
              link: null,
              title: "An entry",
              contentHtml: "5 &lt; 6 &amp; 7 &gt; 3",
              summaryHtml: "5 &lt; 6 &amp; 7 &gt; 3",
              publishedAt: null,
              language: null,
              authorUris: [],
            },
            {
              guid: "urn:xhtml",
              link: null,
              title: null,
              contentHtml: "<p>Hello <em>there</em></p>",
              summaryHtml: null,
              publishedAt: null,
              language: null,
              authorUris: [],
            },
          ],
        },
        validators: { etag: null, lastModified: null },
      },
    });
  });

  it("uses updated only when published is absent and drops invalid dates", async () => {
    const body = `<feed xmlns="http://www.w3.org/2005/Atom">
      <entry><id>urn:updated</id><updated>2026-08-30T00:00:00Z</updated></entry>
      <entry><id>urn:invalid</id><published>not-a-date</published><updated>2026-08-30T00:00:00Z</updated></entry>
    </feed>`;
    fetchMock.mockResolvedValue(new Response(body));

    const result = await createFeedFetcher().fetch(feedUrl, {
      etag: null,
      lastModified: null,
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        feed: {
          items: [
            { publishedAt: new Date("2026-08-30T00:00:00Z") },
            { publishedAt: null },
          ],
        },
      },
    });
  });

  it("preserves an empty entry language override as an effective null", async () => {
    const body = `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en">
      <entry xml:lang=""><id>urn:untagged</id><title>Untagged</title></entry>
    </feed>`;
    fetchMock.mockResolvedValue(new Response(body));

    const result = await createFeedFetcher().fetch(feedUrl, {
      etag: null,
      lastModified: null,
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        feed: {
          language: "en",
          items: [{ guid: "urn:untagged", language: null }],
        },
      },
    });
  });

  it("sends conditional headers and handles not-modified", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 304 }));

    const result = await createFeedFetcher({ userAgent: "test-agent" }).fetch(
      feedUrl,
      {
        etag: 'W/"old"',
        lastModified: "Sat, 29 Aug 2026 00:00:00 GMT",
      },
    );

    expect(result).toEqual({ ok: true, value: { status: "not-modified" } });
    expect(fetchMock).toHaveBeenCalledWith(feedUrl, {
      headers: {
        accept:
          "application/atom+xml, application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
        "user-agent": "test-agent",
        "if-none-match": 'W/"old"',
        "if-modified-since": "Sat, 29 Aug 2026 00:00:00 GMT",
      },
      redirect: "follow",
      signal: expect.any(AbortSignal),
    });
  });

  it("falls back to RSS 2.0 when the document root is not an Atom feed", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        `<rss version="2.0"><channel>
          <title>RSS channel</title>
          <link>https://example.test/</link>
          <description>RSS description</description>
          <language>en-us</language>
          <item>
            <title>RSS item</title>
            <link>https://example.test/rss-item</link>
            <description>&lt;p&gt;Body&lt;/p&gt;</description>
            <pubDate>Sun, 30 Aug 2026 00:00:00 GMT</pubDate>
            <guid isPermaLink="false">urn:rss:1</guid>
          </item>
        </channel></rss>`,
      ),
    );

    const result = await createFeedFetcher().fetch(feedUrl, {
      etag: null,
      lastModified: null,
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: "fetched",
        feed: {
          title: "RSS channel",
          description: "RSS description",
          link: "https://example.test/",
          language: "en-us",
          items: [
            {
              guid: "urn:rss:1",
              link: "https://example.test/rss-item",
              title: "RSS item",
              contentHtml: "<p>Body</p>",
              summaryHtml: null,
              publishedAt: new Date("Sun, 30 Aug 2026 00:00:00 GMT"),
              language: "en-us",
              authorUris: [],
            },
          ],
        },
      },
    });
    expect(parseAtomMock).toHaveBeenCalledOnce();
    expect(parseRss2Mock).toHaveBeenCalledOnce();
  });

  it("rejects RSS 0.9x (no RSS 2.0 root) without an Atom fallback", async () => {
    fetchMock.mockResolvedValue(
      new Response("<rss><channel><title>RSS</title></channel></rss>"),
    );

    const result = await createFeedFetcher().fetch(feedUrl, {
      etag: null,
      lastModified: null,
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        type: "InvalidFeedFormat",
        url: feedUrl,
        message: "document is not a supported feed format (Atom 1.0 or RSS 2.0)",
      },
    });
  });

  it("reports malformed Atom as an invalid feed format without trying RSS 2.0", async () => {
    fetchMock.mockResolvedValue(
      new Response('<feed xmlns="http://www.w3.org/2005/Atom"><entry></feed>'),
    );

    const result = await createFeedFetcher().fetch(feedUrl, {
      etag: null,
      lastModified: null,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { type: "InvalidFeedFormat", url: feedUrl },
    });
    expect(parseRss2Mock).not.toHaveBeenCalled();
  });

  it("rejects malformed UTF-8 response bytes before parsing", async () => {
    const prefix = new TextEncoder().encode(
      '<feed xmlns="http://www.w3.org/2005/Atom"><title>',
    );
    const suffix = new TextEncoder().encode("</title></feed>");
    const body = new Uint8Array(prefix.byteLength + 1 + suffix.byteLength);
    body.set(prefix);
    body[prefix.byteLength] = 0xff;
    body.set(suffix, prefix.byteLength + 1);
    fetchMock.mockResolvedValue(new Response(body));

    const result = await createFeedFetcher().fetch(feedUrl, {
      etag: null,
      lastModified: null,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { type: "InvalidFeedFormat", url: feedUrl },
    });
    expect(parseAtomMock).not.toHaveBeenCalled();
  });

  it("reports non-success HTTP status as a request failure", async () => {
    fetchMock.mockResolvedValue(new Response("unavailable", { status: 503 }));

    const result = await createFeedFetcher().fetch(feedUrl, {
      etag: null,
      lastModified: null,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        type: "RequestFailed",
        url: feedUrl,
        message: "HTTP 503",
      },
    });
  });

  it("reports request timeouts as request failures", async () => {
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!(signal instanceof AbortSignal)) {
            reject(new Error("missing abort signal"));
            return;
          }
          const rejectWithReason = () => reject(signal.reason);
          if (signal.aborted) rejectWithReason();
          else signal.addEventListener("abort", rejectWithReason, { once: true });
        }),
    );

    const result = await createFeedFetcher({ timeoutMs: 1 }).fetch(feedUrl, {
      etag: null,
      lastModified: null,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { type: "RequestFailed", url: feedUrl },
    });
  });

  it("cancels an oversized stream before parsing it", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(33));
      },
      cancel,
    });
    fetchMock.mockResolvedValue(new Response(body));

    const result = await createFeedFetcher({ maxResponseBytes: 32 }).fetch(
      feedUrl,
      { etag: null, lastModified: null },
    );

    expect(result).toMatchObject({
      ok: false,
      error: { type: "InvalidFeedFormat", url: feedUrl },
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(parseAtomMock).not.toHaveBeenCalled();
  });
});

