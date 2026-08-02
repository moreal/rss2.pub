import { describe, expect, it } from "vitest";
import { FeedUrl } from "../../../../src/domain/feed/feed-url.js";
import { unwrap, unwrapErr } from "../../../helpers/result.js";

describe("FeedUrl.create", () => {
  it("canonicalizes scheme, host, default port, and fragment", () => {
    const url = unwrap(
      FeedUrl.create("  HTTPS://Blog.Example.COM:443/Feed.xml#latest  "),
    );
    expect(url).toBe("https://blog.example.com/Feed.xml");
  });

  it("strips the default http port but keeps custom ports", () => {
    expect(unwrap(FeedUrl.create("http://a.com:80/f"))).toBe("http://a.com/f");
    expect(unwrap(FeedUrl.create("http://a.com:8080/f"))).toBe(
      "http://a.com:8080/f",
    );
  });

  it("preserves path case and meaningful query strings", () => {
    const url = unwrap(FeedUrl.create("https://a.com/Blog/RSS?b=2&a=1"));
    expect(url).toBe("https://a.com/Blog/RSS?b=2&a=1");
  });

  it("strips an empty query", () => {
    expect(unwrap(FeedUrl.create("https://a.com/f?"))).toBe("https://a.com/f");
  });

  it("punycodes internationalized hosts", () => {
    const url = unwrap(FeedUrl.create("https://피드.example/f"));
    expect(url.startsWith("https://xn--")).toBe(true);
  });

  it("rejects text that is not a URL", () => {
    expect(unwrapErr(FeedUrl.create("not a url"))).toEqual({
      type: "NotAUrl",
      raw: "not a url",
    });
  });

  it("rejects non-http(s) protocols", () => {
    expect(unwrapErr(FeedUrl.create("ftp://a.com/feed"))).toMatchObject({
      type: "UnsupportedProtocol",
      protocol: "ftp:",
    });
    expect(unwrapErr(FeedUrl.create("mailto:feed@a.com"))).toMatchObject({
      type: "UnsupportedProtocol",
      protocol: "mailto:",
    });
  });
});
