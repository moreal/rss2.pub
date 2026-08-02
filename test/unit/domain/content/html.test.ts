import { describe, expect, it } from "vitest";
import {
  decodeEntities,
  escapeHtml,
  firstParagraph,
  stripHtml,
  truncateText,
} from "../../../../src/domain/content/html.js";

describe("decodeEntities", () => {
  it("decodes named, decimal, and hex entities", () => {
    expect(decodeEntities("a &amp; b &lt;c&gt; &#65;&#x41;")).toBe(
      "a & b <c> AA",
    );
  });

  it("keeps unknown and invalid entities verbatim", () => {
    expect(decodeEntities("&unknown; &#x110000;")).toBe(
      "&unknown; &#x110000;",
    );
  });
});

describe("stripHtml", () => {
  it("removes tags and collapses whitespace", () => {
    expect(stripHtml("<p>Hello <strong>world</strong></p>\n<p>bye</p>")).toBe(
      "Hello world bye",
    );
  });

  it("drops script and style contents entirely", () => {
    expect(
      stripHtml("a<script>alert('x')</script>b<style>p{color:red}</style>c"),
    ).toBe("a b c");
  });

  it("decodes entities in the extracted text", () => {
    expect(stripHtml("<p>fish &amp; chips</p>")).toBe("fish & chips");
  });
});

describe("firstParagraph", () => {
  it("returns the inner HTML of the first <p>", () => {
    expect(firstParagraph("<p>first <em>one</em></p><p>second</p>")).toBe(
      "first <em>one</em>",
    );
  });

  it("handles <p> tags with attributes", () => {
    expect(firstParagraph('<p class="lead">a</p><p>b</p>')).toBe("a");
  });

  it("falls back to the first blank-line block for plain text", () => {
    expect(firstParagraph("para one\n\npara two")).toBe("para one");
  });

  it("returns null when no block is smaller than the whole", () => {
    expect(firstParagraph("just a single run of text")).toBeNull();
  });
});

describe("escapeHtml", () => {
  it("escapes the five significant characters", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });
});

describe("truncateText", () => {
  it("returns text at or under the limit unchanged", () => {
    expect(truncateText("abcde", 5)).toBe("abcde");
  });

  it("cuts over-limit text and appends an ellipsis within the limit", () => {
    const cut = truncateText("a".repeat(10), 5);
    expect(cut).toBe("aaaa…");
    expect(cut.length).toBeLessThanOrEqual(5);
  });
});
