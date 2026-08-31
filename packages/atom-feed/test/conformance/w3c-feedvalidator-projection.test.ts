import { expect, it } from "vitest";

import { W3C_ATOM_CASES } from "./w3c-feedvalidator-cases.js";
import { parseW3cAtomCase } from "./w3c-feedvalidator-runner.js";

const PROJECT_PATHS = Object.freeze({
  brief: "1.1/brief-noerror.xml",
  extensive: "1.1/extensive-noerror.xml",
  prefixedNamespace: "1.2/prefixed-namespace.xml",
  infosetCdata: "2/infoset-cdata.xml",
  infosetCharRef: "2/infoset-char-ref.xml",
  blankLanguage: "2/xml-lang-blank.xml",
  language: "2/xml-lang.xml",
  textTitle: "3.1.1.1/example_text_title.xml",
  htmlTitle: "3.1.1.2/example_html_title.xml",
  xhtmlSummaryDefaultNamespace: "3.1.1.3/example_xhtml_summary2.xml",
  xhtmlSummaryPrefixedNamespace: "3.1.1.3/example_xhtml_summary3.xml",
  missingXhtmlDiv: "3.1.1.3/missing_xhtml_div.xml",
  missingXhtmlNamespace: "3.1.1.3/missing_xhtml_ns.xml",
  wrongXhtmlDivNamespace: "3.1.1.3/wrong_namespace_for_xhtml_div.xml",
  publishedFractionalSecond: "3.3/published_fractional_second.xml",
  feedAndEntryAuthor: "4.1.1/author-at-feed-and-entry.xml",
  feedOnlyAuthor: "4.1.1/author-at-feed-only.xml",
  externalContent: "4.1.3.2/content-src-no-type-no-error.xml",
  multipleAuthors: "4.2.11/multiple-authors.xml",
});

function projected(path: string) {
  const testCase = W3C_ATOM_CASES.find((candidate) => candidate.path === path);
  if (testCase === undefined || testCase.classification !== "project") {
    throw new Error(`Missing project manifest row: ${path}`);
  }
  const result = parseW3cAtomCase(testCase);
  if (!result.ok) throw new Error(`${path}: ${result.error.type}`);
  return result.value;
}

it("rejects XHTML descendants that leave the XHTML namespace", () => {
  expect(projected(PROJECT_PATHS.missingXhtmlNamespace).entries[0]?.summary).toBeNull();
});

it("projects the W3C extensive feed", () => {
  expect(projected(PROJECT_PATHS.extensive)).toMatchObject({
    id: "tag:example.org,2003:3",
    title: { type: "text", value: "dive into mark", plainText: "dive into mark" },
    subtitle: { type: "html", plainText: expect.stringContaining("A lot of effort") },
    link: "http://example.org/",
    entries: [{
      id: "tag:example.org,2003:3.2397",
      link: "http://example.org/2005/04/02/atom",
      published: "2003-12-13T08:29:29-04:00",
      authors: [{
        name: "Mark Pilgrim",
        uri: "http://example.org/",
        email: "f8dy@example.com",
      }],
      content: {
        type: "xhtml",
        value: "\n        <p><i>[Update: The Atom draft is finished.]</i></p>\n      ",
      },
    }],
  });
});

it("decodes XML infoset text consistently", () => {
  expect(projected(PROJECT_PATHS.infosetCdata).entries[0]?.summary?.value)
    .toBe("Some <b>bold</b> text.");
  expect(projected(PROJECT_PATHS.infosetCharRef).entries[0]?.updated)
    .toBe("2003-12-13T18:30:02Z");
});

it("projects text, HTML, and prefixed XHTML constructs", () => {
  expect(projected(PROJECT_PATHS.textTitle).entries[0]?.title?.type).toBe("text");
  expect(projected(PROJECT_PATHS.htmlTitle).entries[0]?.title?.type).toBe("html");
  expect(projected(PROJECT_PATHS.xhtmlSummaryDefaultNamespace).entries[0]?.summary)
    .toMatchObject({ type: "xhtml", value: expect.stringContaining("<b>XHTML</b>") });
  expect(projected(PROJECT_PATHS.xhtmlSummaryPrefixedNamespace).entries[0]?.summary)
    .toMatchObject({ type: "xhtml", value: expect.stringContaining("<b>XHTML</b>") });
});

it("returns null for invalid XHTML wrappers", () => {
  expect(projected(PROJECT_PATHS.missingXhtmlDiv).entries[0]?.summary).toBeNull();
  expect(projected(PROJECT_PATHS.wrongXhtmlDivNamespace).entries[0]?.summary).toBeNull();
});

it("honors Atom language and external-content rules", () => {
  expect(projected(PROJECT_PATHS.language).language).toBe("en-us");
  expect(projected(PROJECT_PATHS.blankLanguage).language).toBeNull();
  expect(projected(PROJECT_PATHS.externalContent).entries[0]?.content).toBeNull();
});

it("applies entry and feed author precedence while preserving multiple authors", () => {
  expect(projected(PROJECT_PATHS.feedAndEntryAuthor).entries[0]?.authors)
    .toEqual([{ name: "Jane Doe", uri: null, email: null }]);
  expect(projected(PROJECT_PATHS.feedOnlyAuthor).entries[0]?.authors)
    .toEqual([{ name: "John Doe", uri: null, email: null }]);
  expect(projected(PROJECT_PATHS.multipleAuthors).entries[0]?.authors)
    .toEqual([
      { name: "John Doe", uri: null, email: null },
      { name: "Jane Doe", uri: null, email: null },
    ]);
});

it("preserves RFC 3339 source strings", () => {
  const entry = projected(PROJECT_PATHS.publishedFractionalSecond).entries[0];
  expect(entry?.published).toBe("2002-12-31T19:20:30.45+01:00");
  expect(entry?.updated).toBe("2003-12-13T18:30:02Z");
});

it("selects omitted-rel links and parses prefixed Atom elements", () => {
  expect(projected(PROJECT_PATHS.brief).link).toBe("http://example.org/");
  expect(projected(PROJECT_PATHS.prefixedNamespace)).toMatchObject({
    id: "urn:uuid:60a76c80-d399-11d9-b93C-0003939e0af6",
    entries: [{ id: "urn:uuid:1225c695-cfb8-4ebb-aaaa-80da344efa6a" }],
  });
});

it("covers every project manifest row exactly once", () => {
  const expected = W3C_ATOM_CASES
    .filter((testCase) => testCase.classification === "project")
    .map((testCase) => testCase.path)
    .sort();
  const actual = Object.values(PROJECT_PATHS).sort();

  expect(actual).toEqual(expected);
  expect(new Set(actual).size).toBe(actual.length);
});
