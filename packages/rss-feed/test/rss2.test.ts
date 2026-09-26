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
    const result = parseRss2(`<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
      <channel>
        <title>T</title>
        <link>https://example.test/</link>
        <item>
          <title>Item</title>
          <atom:link rel="self" href="https://example.test/feed" />
          <link>https://example.test/item</link>
        </item>
      </channel>
    </rss>`);

    if (!result.ok) {
      throw new Error(result.error.type);
    }
    expect(result.value.items[0]).toMatchObject({ title: "Item", link: "https://example.test/item" });
  });

  it("parses the content module content:encoded element", () => {
    const result = parseRss2(`<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
      <channel>
        <title>T</title>
        <item>
          <title>Item</title>
          <description>Summary</description>
          <content:encoded>&lt;p&gt;Full body&lt;/p&gt;</content:encoded>
        </item>
      </channel>
    </rss>`);

    if (!result.ok) {
      throw new Error(result.error.type);
    }
    expect(result.value.items[0]).toMatchObject({
      description: "Summary",
      contentEncoded: "<p>Full body</p>",
    });
  });

  it("parses item author, categories, comments, enclosure, and source", () => {
    const result = parseRss2(`<rss version="2.0">
      <channel>
        <title>T</title>
        <item>
          <title>Item</title>
          <author>jbb@example.com (Joe Bob)</author>
          <category>movies</category>
          <category domain="rec.arts.movies.reviews">1983/V</category>
          <comments>https://example.test/feedback</comments>
          <enclosure url="https://example.test/a.mp3" length="24986239" type="audio/mpeg" />
          <source url="https://example.com/rss.xml">Example</source>
        </item>
      </channel>
    </rss>`);

    if (!result.ok) {
      throw new Error(result.error.type);
    }
    expect(result.value.items[0]).toMatchObject({
      author: "jbb@example.com (Joe Bob)",
      categories: [
        { value: "movies", domain: null },
        { value: "1983/V", domain: "rec.arts.movies.reviews" },
      ],
      comments: "https://example.test/feedback",
      enclosure: {
        url: "https://example.test/a.mp3",
        length: "24986239",
        type: "audio/mpeg",
      },
      source: { value: "Example", url: "https://example.com/rss.xml" },
    });
  });

  it("parses channel metadata, cloud, image, textInput, and skip schedules", () => {
    const result = parseRss2(`<rss version="2.0">
      <channel>
        <title>T</title>
        <pubDate>Sun, 29 Jan 2006 05:00:00 GMT</pubDate>
        <lastBuildDate>Sun, 29 Jan 2006 17:17:44 GMT</lastBuildDate>
        <generator>Radio UserLand v8.2.1</generator>
        <docs>https://www.rssboard.org/rss-specification</docs>
        <ttl>60</ttl>
        <copyright>Copyright 2006 Example</copyright>
        <managingEditor>jlehrer@example.com (Jim Lehrer)</managingEditor>
        <webMaster>helpdesk@example.com</webMaster>
        <rating>(PICS-1.1 ...)</rating>
        <category>Media</category>
        <category domain="dmoz">News</category>
        <cloud domain="server.example.com" path="/rpc" port="80" protocol="xml-rpc" registerProcedure="cloud.notify" />
        <image>
          <link>https://example.com</link>
          <title>Example</title>
          <url>https://example.com/masthead.gif</url>
          <description>Read Example</description>
          <height>32</height>
          <width>96</width>
        </image>
        <textInput>
          <description>Search</description>
          <link>https://example.com/search.pl</link>
          <name>query</name>
          <title>Search Example</title>
        </textInput>
        <skipDays><day>Saturday</day><day>Sunday</day></skipDays>
        <skipHours><hour>0</hour><hour>23</hour></skipHours>
      </channel>
    </rss>`);

    if (!result.ok) {
      throw new Error(result.error.type);
    }
    expect(result.value).toMatchObject({
      pubDate: "Sun, 29 Jan 2006 05:00:00 GMT",
      lastBuildDate: "Sun, 29 Jan 2006 17:17:44 GMT",
      generator: "Radio UserLand v8.2.1",
      docs: "https://www.rssboard.org/rss-specification",
      ttl: "60",
      copyright: "Copyright 2006 Example",
      managingEditor: "jlehrer@example.com (Jim Lehrer)",
      webMaster: "helpdesk@example.com",
      rating: "(PICS-1.1 ...)",
      categories: [
        { value: "Media", domain: null },
        { value: "News", domain: "dmoz" },
      ],
      cloud: {
        domain: "server.example.com",
        port: "80",
        path: "/rpc",
        registerProcedure: "cloud.notify",
        protocol: "xml-rpc",
      },
      image: {
        title: "Example",
        url: "https://example.com/masthead.gif",
        link: "https://example.com",
        width: "96",
        height: "32",
        description: "Read Example",
      },
      textInput: {
        title: "Search Example",
        description: "Search",
        name: "query",
        link: "https://example.com/search.pl",
      },
      skipDays: ["Saturday", "Sunday"],
      skipHours: ["0", "23"],
    });
  });
});

