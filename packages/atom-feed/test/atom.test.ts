import { describe, expect, it } from "vitest";

import { parseAtom } from "../src/index.js";

const NS = "http://www.w3.org/2005/Atom";
const XHTML_NS = "http://www.w3.org/1999/xhtml";

describe("parseAtom metadata and text constructs", () => {
  it("parses direct Atom children without capturing nested lookalikes", () => {
    const result = parseAtom(`<feed xmlns="${NS}" xml:lang="en">
      <id>urn:feed</id><title>Feed title</title><subtitle type="html">A &lt;b&gt;feed&lt;/b&gt;</subtitle>
      <link rel="self" href="https://example.test/feed.xml"/>
      <link rel="alternate" href="https://example.test/"/>
      <entry><id>urn:one</id><title>One</title>
        <source><title>Source title must not replace the entry</title></source>
        <content type="xhtml"><div xmlns="${XHTML_NS}">Hello <b>world</b>.</div></content>
        <updated>2026-08-30T00:00:00Z</updated>
      </entry>
    </feed>`);

    expect(result).toMatchObject({
      ok: true,
      value: {
        id: "urn:feed",
        title: { type: "text", value: "Feed title", plainText: "Feed title" },
        subtitle: { type: "html", value: "A <b>feed</b>", plainText: "A feed" },
        link: "https://example.test/",
        language: "en",
        entries: [{
          id: "urn:one",
          title: { type: "text", value: "One", plainText: "One" },
          content: {
            type: "xhtml",
            value: "Hello <b>world</b>.",
            plainText: "Hello world.",
          },
          updated: "2026-08-30T00:00:00Z",
        }],
      },
    });
  });

  it("decodes text and HTML entities while treating unknown types as text", () => {
    const result = parseAtom(`<feed xmlns="${NS}">
      <id>urn:feed</id><title>Fish &amp; Chips</title><subtitle type="html">2 &lt; 3</subtitle>
      <entry><id>urn:one</id><title type="unknown">A &lt;b&gt;literal&lt;/b&gt;</title>
        <summary type="html">A &lt;em&gt;fish&lt;/em&gt; &amp;amp; chips</summary>
      </entry>
    </feed>`);

    expect(result).toMatchObject({
      ok: true,
      value: {
        title: { type: "text", value: "Fish & Chips", plainText: "Fish & Chips" },
        subtitle: { type: "html", value: "2 < 3", plainText: "2 < 3" },
        entries: [{
          title: {
            type: "text",
            value: "A <b>literal</b>",
            plainText: "A <b>literal</b>",
          },
          summary: {
            type: "html",
            value: "A <em>fish</em> &amp; chips",
            plainText: "A fish &amp; chips",
          },
        }],
      },
    });
  });

  it("serializes XHTML children from prefixed and default namespace wrappers", () => {
    const result = parseAtom(`<feed xmlns="${NS}">
      <entry><id>default</id><content type="xhtml"><div xmlns="${XHTML_NS}"><p title="A &amp; B">First <b>second</b>.</p></div></content></entry>
      <entry><id>prefixed</id><content type="xhtml"><xhtml:div xmlns:xhtml="${XHTML_NS}"><xhtml:p title="&quot;quoted&quot; &amp; &lt;escaped&gt;">Third <xhtml:strong>fourth</xhtml:strong>.</xhtml:p></xhtml:div></content></entry>
    </feed>`);

    if (!result.ok) {
      throw new Error(result.error.type);
    }

    expect(result.value.entries.map((entry) => entry.content)).toEqual([
      {
        type: "xhtml",
        value: '<p title="A &amp; B">First <b>second</b>.</p>',
        plainText: "First second.",
      },
      {
        type: "xhtml",
        value: '<p title="&quot;quoted&quot; &amp; &lt;escaped&gt;">Third <strong>fourth</strong>.</p>',
        plainText: "Third fourth.",
      },
    ]);
  });

  it("selects explicit and default alternate links and preserves published and updated values", () => {
    const result = parseAtom(`<feed xmlns="${NS}">
      <link rel="alternate" href="https://example.test/first"/>
      <link rel="alternate" href="https://example.test/second"/>
      <entry><id>urn:one</id>
        <link href="https://example.test/one"/>
        <link rel="alternate" href="https://example.test/one-other"/>
        <published>2026-08-01T00:00:00Z</published>
        <updated>2026-08-02T00:00:00Z</updated>
      </entry>
    </feed>`);

    expect(result).toMatchObject({
      ok: true,
      value: {
        link: "https://example.test/first",
        entries: [{
          link: "https://example.test/one",
          published: "2026-08-01T00:00:00Z",
          updated: "2026-08-02T00:00:00Z",
        }],
      },
    });
  });

  it("does not expose inline content when Atom content has a src attribute", () => {
    const result = parseAtom(`<feed xmlns="${NS}">
      <entry><id>urn:one</id>
        <content type="html" src="https://example.test/full">&lt;p&gt;Ignored inline content&lt;/p&gt;</content>
      </entry>
    </feed>`);

    expect(result).toMatchObject({
      ok: true,
      value: { entries: [{ content: null }] },
    });
  });

  it("requires an XHTML div wrapper", () => {
    const result = parseAtom(`<feed xmlns="${NS}">
      <entry><id>urn:one</id><content type="xhtml"><p xmlns="${XHTML_NS}">Not wrapped</p></content></entry>
    </feed>`);

    expect(result).toMatchObject({
      ok: true,
      value: { entries: [{ content: null }] },
    });
  });

  it("permits whitespace but rejects other content beside an XHTML div", () => {
    const result = parseAtom(`<feed xmlns="${NS}">
      <entry><id>whitespace</id><content type="xhtml">
        <div xmlns="${XHTML_NS}">Accepted</div>
      </content></entry>
      <entry><id>stray</id><content type="xhtml">stray text<div xmlns="${XHTML_NS}">Rejected</div></content></entry>
    </feed>`);

    if (!result.ok) {
      throw new Error(result.error.type);
    }

    expect(result.value.entries.map((entry) => entry.content)).toEqual([
      { type: "xhtml", value: "Accepted", plainText: "Accepted" },
      null,
    ]);
  });
});
