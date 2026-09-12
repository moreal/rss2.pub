import { describe, expect, it } from "vitest";
import { parseRss2 } from "../src/index.js";

describe("parseRss2 channel and item metadata", () => {
  it("parses channel and item fields in document order", () => {
    const result = parseRss2(`<rss version="2.0">
      <channel>
        <title>Channel title</title>
        <link>https://example.test/</link>
        <description>Channel description</description>
        <language>en-us</language>
        <item>
          <title>First</title>
          <link>https://example.test/first</link>
          <description>First body</description>
          <pubDate>Sun, 30 Aug 2026 00:00:00 GMT</pubDate>
          <guid isPermaLink="false">urn:first</guid>
        </item>
        <item>
          <title>Second</title>
          <guid>https://example.test/second</guid>
        </item>
      </channel>
    </rss>`);

    expect(result).toMatchObject({
      ok: true,
      value: {
        title: "Channel title",
        link: "https://example.test/",
        description: "Channel description",
        language: "en-us",
        items: [
          {
            title: "First",
            link: "https://example.test/first",
            description: "First body",
            pubDate: "Sun, 30 Aug 2026 00:00:00 GMT",
            guid: "urn:first",
            guidIsPermaLink: false,
          },
          {
            title: "Second",
            link: null,
            description: null,
            pubDate: null,
            guid: "https://example.test/second",
            guidIsPermaLink: true,
          },
        ],
      },
    });
  });

  it("defaults guid isPermaLink to true when the attribute is absent", () => {
    const result = parseRss2(
      "<rss version=\"2.0\"><channel><item><guid>1</guid></item></channel></rss>",
    );
    if (!result.ok) {
      throw new Error(result.error.type);
    }
    expect(result.value.items[0]).toMatchObject({ guid: "1", guidIsPermaLink: true });
  });

  it("ignores unrelated namespaced elements sharing a local name", () => {
    const result = parseRss2(`<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
      <channel>
        <title>T</title>
        <item>
          <title>Item</title>
          <content:encoded>Full body, out of scope for this parser</content:encoded>
        </item>
      </channel>
    </rss>`);

    if (!result.ok) {
      throw new Error(result.error.type);
    }
    expect(result.value.items[0]).toMatchObject({ title: "Item", description: null });
  });
});

