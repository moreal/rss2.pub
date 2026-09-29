import { expect, it, vi } from "vitest";
import { FeedUrl } from "../../../../src/domain/feed/feed-url.js";
import { createHtmlFeedDiscoverer } from "../../../../src/infrastructure/feedfetch/html-feed-discoverer.js";
import { unwrap } from "../../../helpers/result.js";

it("finds Atom and RSS alternate links with relative URLs and ignores unrelated links", async () => {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(`<html><head>
    <link rel="stylesheet" href="/styles.css">
    <link rel="alternate" type="application/rss+xml" href="http://%">
    <link rel="alternate" type="application/atom+xml" href="/atom.xml">
    <link rel="alternate" type="application/rss+xml" href="https://site.test/rss.xml">
    <link rel="alternate" type="text/html" href="/about">
    <link rel="alternate" type="application/rss+xml" href="javascript:alert(1)">
  </head></html>`, { headers: { "content-type": "text/html" } }));
  const discoverer = createHtmlFeedDiscoverer({ allowPrivateAddress: true, fetchImpl });
  const result = unwrap(await discoverer.discover(unwrap(FeedUrl.create("https://site.test/blog"))));
  expect(result).toEqual([
    "https://site.test/atom.xml",
    "https://site.test/rss.xml",
  ]);
});
