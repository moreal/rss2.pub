import { expect, it } from "vitest";

import { W3C_RSS20_CASES } from "./w3c-feedvalidator-cases.js";
import { parseW3cRss20Case } from "./w3c-feedvalidator-runner.js";

const PROJECT_PATHS = Object.freeze({
  dateFormats: "data-types-datetime/everything.xml",
  ignoredCategory: "element-channel-item-category/blank_category.xml",
  ignoredEnclosure: "element-channel-item-enclosure/item_enclosure_zero_length.xml",
  sample: "introduction/rss-2.0-sample-noerror.xml",
  contentEncoded: "namespace-elements-content-encoded/content_before_description.xml",
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
  const sample = projected(PROJECT_PATHS.sample);
  expect(sample).toMatchObject({
    title: "Dallas Times-Herald",
    description: "Current headlines from the Dallas Times-Herald newspaper",
    link: "http://dallas.example.com",
    language: "epo",
    pubDate: "Sun, 29 Jan 2006 05:00:00 GMT",
    lastBuildDate: "Sun, 29 Jan 2006 17:17:44 GMT",
    generator: "Radio UserLand v8.2.1",
    docs: "http://www.rssboard.org/rss-specification",
    ttl: "60",
    copyright: "Copyright 2006 Dallas Times-Herald",
    managingEditor: "jlehrer@dallas.example.com (Jim Lehrer)",
    webMaster: "helpdesk@dallas.example.com",
    rating: expect.stringContaining("PICS-1.1"),
    categories: [
      { value: "Media", domain: null },
      { value: "News/Newspapers/Regional/United_States/Texas", domain: "dmoz" },
    ],
    cloud: {
      domain: "server.example.com",
      path: "/rpc",
      port: "80",
      protocol: "xml-rpc",
      registerProcedure: "cloud.notify",
    },
    image: {
      title: "Dallas Times-Herald",
      url: "http://dallas.example.com/masthead.gif",
      link: "http://dallas.example.com",
      width: "96",
      height: "32",
      description: "Read the Dallas Times-Herald",
    },
    textInput: {
      title: "TextInput Inquiry",
      description: expect.stringContaining("Your aggregator supports the textInput element"),
      name: "query",
      link: "http://www.cadenhead.org/textinput.php",
    },
    skipHours: ["0", "1", "2", "22", "23"],
    skipDays: ["Saturday", "Sunday"],
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
        author: "jbb@dallas.example.com (Joe Bob Briggs)",
        categories: [
          { value: "movies", domain: null },
          { value: "1983/V", domain: "rec.arts.movies.reviews" },
        ],
        comments: "http://dallas.example.com/feedback/1983/06/joebob.htm",
        enclosure: {
          url: "http://dallas.example.com/joebob_050689.mp3",
          length: "24986239",
          type: "audio/mpeg",
        },
        source: { value: "Los Angeles Herald-Examiner", url: "http://la.example.com/rss.xml" },
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

it("projects consumed category and enclosure elements with raw values", () => {
  const categoryItem = projected(PROJECT_PATHS.ignoredCategory).items[0];
  const enclosureItem = projected(PROJECT_PATHS.ignoredEnclosure).items[0];

  expect(categoryItem).toEqual({
    guid: null,
    guidIsPermaLink: false,
    link: null,
    title: "Valid comments",
    description: null,
    pubDate: null,
    author: null,
    categories: [{ value: "", domain: null }],
    comments: null,
    enclosure: null,
    source: null,
    contentEncoded: null,
  });
  expect(enclosureItem).toEqual({
    guid: null,
    guidIsPermaLink: false,
    link: "http://purl/org/rss/2.0/?item",
    title: "Invalid item enclosure",
    description: "Foo",
    pubDate: null,
    author: null,
    categories: [],
    comments: null,
    enclosure: {
      url: "http://live.curry.com/mp3/celebritySCms.mp3",
      length: "0",
      type: "audio/mpeg",
    },
    source: null,
    contentEncoded: null,
  });
});

it("projects the content module content:encoded element", () => {
  const item = projected(PROJECT_PATHS.contentEncoded).items[0];
  expect(item).toMatchObject({
    title: "Duplicate semantics",
    description: "Foo",
    contentEncoded: "Bar",
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