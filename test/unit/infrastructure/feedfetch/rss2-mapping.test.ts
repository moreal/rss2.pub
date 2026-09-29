import { describe, expect, it } from "vitest";
import type { Rss2ItemDto } from "@rss2pub/rss-feed";
import { mapRss2Entry } from "../../../../src/infrastructure/feedfetch/rss2-mapping.js";

const item: Rss2ItemDto = {
  guid: "episode-1",
  guidIsPermaLink: false,
  link: null,
  title: "Episode",
  description: "Short description",
  pubDate: null,
  author: null,
  dcCreator: null,
  categories: [],
  comments: null,
  enclosure: null,
  source: null,
  contentEncoded: null,
};

describe("RSS 2.0 domain mapping", () => {
  it("publishes content:encoded and retains description as summary", () => {
    expect(mapRss2Entry({ ...item, contentEncoded: "<p>Full episode</p>" }, null))
      .toMatchObject({ contentHtml: "<p>Full episode</p>", summaryHtml: "Short description" });
  });

  it("uses description as the body when content:encoded is absent", () => {
    expect(mapRss2Entry(item, null))
      .toMatchObject({ contentHtml: "Short description", summaryHtml: "Short description" });
  });

  it("uses an audio enclosure as the link only when no item link exists", () => {
    const enclosure = { url: "https://media.example/one.mp3", type: "audio/mpeg", length: "10" };
    expect(mapRss2Entry({ ...item, enclosure }, null).link).toBe(enclosure.url);
    expect(mapRss2Entry({ ...item, link: "https://example/episode", enclosure }, null).link)
      .toBe("https://example/episode");
    expect(mapRss2Entry({ ...item, enclosure: { ...enclosure, type: "video/mp4" } }, null).link)
      .toBeNull();
    expect(mapRss2Entry({ ...item, enclosure: { ...enclosure, url: "javascript:alert(1)" } }, null).link)
      .toBeNull();
  });

  it("keeps only explicit HTTP(S) author URIs as actor lookup candidates", () => {
    expect(mapRss2Entry({
      ...item,
      author: "alice@example.test (Alice)",
      dcCreator: "https://actors.test/bob",
    }, null).authorUris).toEqual(["https://actors.test/bob"]);
    expect(mapRss2Entry({ ...item, author: "alice@example.test", dcCreator: "bob@example.test" }, null).authorUris)
      .toEqual([]);
    expect(mapRss2Entry({ ...item, author: "https://actors.test/alice", dcCreator: "acct:bob@example.test" }, null).authorUris)
      .toEqual(["https://actors.test/alice"]);
    expect(mapRss2Entry({ ...item, dcCreator: "Display Name" }, null).authorUris)
      .toEqual([]);
  });
});
