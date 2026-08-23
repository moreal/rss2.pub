import { describe, expect, it } from "vitest";
import {
  atomEntryXmlLangs,
  atomFeedXmlLang,
} from "../../../../src/infrastructure/feedfetch/rss-parser-fetcher.js";

describe("atomFeedXmlLang", () => {
  it("reads xml:lang off the feed root", () => {
    const body = `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ko"><title>t</title></feed>`;
    expect(atomFeedXmlLang(body)).toBe("ko");
  });

  it("returns null when the root has no xml:lang", () => {
    const body = `<feed xmlns="http://www.w3.org/2005/Atom"><title>t</title></feed>`;
    expect(atomFeedXmlLang(body)).toBeNull();
  });

  it("returns null for RSS documents (no <feed> tag)", () => {
    const body = `<rss version="2.0"><channel><language>ko</language></channel></rss>`;
    expect(atomFeedXmlLang(body)).toBeNull();
  });

  it("works regardless of attribute order or quote style", () => {
    const body = `<feed xml:lang='en-US' xmlns="http://www.w3.org/2005/Atom">`;
    expect(atomFeedXmlLang(body)).toBe("en-US");
  });
});

describe("atomEntryXmlLangs", () => {
  it("reads each entry's own xml:lang in document order", () => {
    const body = `<feed xml:lang="en">
      <entry xml:lang="ko"><id>1</id></entry>
      <entry><id>2</id></entry>
      <entry xml:lang="ja"><id>3</id></entry>
    </feed>`;
    expect(atomEntryXmlLangs(body)).toEqual(["ko", null, "ja"]);
  });

  it("returns an empty array for RSS documents (no <entry> tags)", () => {
    const body = `<rss version="2.0"><channel><item><title>t</title></item></channel></rss>`;
    expect(atomEntryXmlLangs(body)).toEqual([]);
  });
});
