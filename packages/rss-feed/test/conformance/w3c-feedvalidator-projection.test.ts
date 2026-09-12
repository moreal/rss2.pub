import { expect, it } from "vitest";

import { W3C_RSS20_CASES } from "./w3c-feedvalidator-cases.js";
import { parseW3cRss20Case } from "./w3c-feedvalidator-runner.js";

const PROJECT_PATHS = Object.freeze({
  dateFormats: "data-types-datetime/everything.xml",
  ignoredCategory: "element-channel-item-category/blank_category.xml",
  ignoredEnclosure: "element-channel-item-enclosure/item_enclosure_zero_length.xml",
  sample: "introduction/rss-2.0-sample-noerror.xml",
});

function projected(path: string) {
  const testCase = W3C_RSS20_CASES.find((candidate) => candidate.path === path);
  if (testCase === undefined || testCase.classification !== "project") {
    throw new Error(`Missing project manifest row: ${path}`);
  }
  const result = parseW3cRss20Case(testCase);
  if (!result.ok) throw new Error(`${path}: ${result.error.type}`);
  return result.value;
}

it("projects the representative RSS 2.0 sample", () => {
  expect(projected(PROJECT_PATHS.sample)).toMatchObject({
    title: "Dallas Times-Herald",
    description: "Current headlines from the Dallas Times-Herald newspaper",
    link: "http://dallas.example.com",
    language: "epo",
    items: [
      {
        title: "Seventh Heaven! Ryan Hurls Another No Hitter",
        link: "http://dallas.example.com/1991/05/02/nolan.htm",
        description: expect.stringContaining("Nolan Ryan hurled the seventh no-hitter"),
        pubDate: null,
        guid: "http://dallas.example.com/1991/05/02/nolan.htm",
        guidIsPermaLink: true,
      },
      {
        title: "Joe Bob Goes to the Drive-In",
        link: "http://dallas.example.com/1983/05/06/joebob.htm",
        description: expect.stringContaining("I'm headed for France"),
        pubDate: "Fri, 06 May 1983 09:00:00 CST",
        guid: "http://dallas.example.com/1983/05/06/joebob.htm",
        guidIsPermaLink: true,
      },
      {
        guid: "1983-05-06+lifestyle+joebob+1",
        guidIsPermaLink: false,
      },
      {
        guid: "1983-05-06+lifestyle+joebob+2",
        guidIsPermaLink: false,
      },
    ],
  });
});

it("preserves diverse real-world pubDate strings", () => {
  const items = projected(PROJECT_PATHS.dateFormats).items;
  expect(items[0]?.pubDate).toBe("Thu, 09 Feb 2006 23:59:45 +0000");
  expect(items[1]?.pubDate).toBe("09 Feb 2006 23:59:45 +0000");
  expect(items[3]?.pubDate).toBe("Thu, 09 Feb 2006 23:59 +0000");
  expect(items[6]?.pubDate).toBe("Thu, 09 Feb 2006 16:59:45 PDT");
});

it("silently ignores unconsumed category and enclosure elements", () => {
  const categoryItem = projected(PROJECT_PATHS.ignoredCategory).items[0];
  const enclosureItem = projected(PROJECT_PATHS.ignoredEnclosure).items[0];

  expect(categoryItem).toEqual({
    guid: null,
    guidIsPermaLink: false,
    link: null,
    title: "Valid comments",
    description: null,
    pubDate: null,
  });
  expect(enclosureItem).toEqual({
    guid: null,
    guidIsPermaLink: false,
    link: "http://purl/org/rss/2.0/?item",
    title: "Invalid item enclosure",
    description: "Foo",
    pubDate: null,
  });
});

it("covers every project manifest row exactly once", () => {
  const expected = W3C_RSS20_CASES
    .filter((testCase) => testCase.classification === "project")
    .map((testCase) => testCase.path)
    .sort();
  const actual = Object.values(PROJECT_PATHS).sort();

  expect(actual).toEqual(expected);
  expect(new Set(actual).size).toBe(actual.length);
});
