import { describe, expect, it } from "vitest";
import { parseRss2 } from "../src/index.js";

describe("parseRss2 XML boundary", () => {
  it("accepts only an rss-rooted 2.0 document with a channel", () => {
    expect(parseRss2("<rss version=\"2.0\"><channel><title>T</title></channel></rss>").ok)
      .toBe(true);
    expect(parseRss2("<rss version=\"2.0\"/>")).toMatchObject({
      ok: false,
      error: { type: "NotRss2Feed" },
    });
    expect(parseRss2("<rss version=\"0.92\"><channel/></rss>")).toMatchObject({
      ok: false,
      error: { type: "NotRss2Feed" },
    });
    expect(parseRss2(`<feed xmlns="http://www.w3.org/2005/Atom"><title>A</title></feed>`))
      .toMatchObject({ ok: false, error: { type: "NotRss2Feed" } });
  });

  it("rejects malformed XML and DOCTYPE", () => {
    expect(parseRss2("<rss version=\"2.0\"><channel></rss>")).toMatchObject({
      ok: false,
      error: { type: "MalformedXml" },
    });
    expect(parseRss2("<!DOCTYPE rss><rss version=\"2.0\"><channel/></rss>")).toMatchObject({
      ok: false,
      error: { type: "UnsafeXml" },
    });
  });

  it("enforces depth and node limits", () => {
    expect(parseRss2(
      "<rss version=\"2.0\"><channel><a><b/></a></channel></rss>",
      { maxDepth: 3 },
    )).toMatchObject({ ok: false, error: { type: "LimitExceeded", limit: "depth" } });
    expect(parseRss2(
      "<rss version=\"2.0\"><channel><a/><b/></channel></rss>",
      { maxNodes: 3 },
    )).toMatchObject({ ok: false, error: { type: "LimitExceeded", limit: "nodes" } });
  });
});

