import { describe, expect, it } from "vitest";
import { FeedLanguage } from "../../../../src/domain/feed/feed-language.js";
import { unwrap, unwrapErr } from "../../../helpers/result.js";

describe("FeedLanguage.create", () => {
  it("accepts a bare language subtag", () => {
    expect(unwrap(FeedLanguage.create("ko"))).toBe("ko");
  });

  it("accepts a language-region tag", () => {
    expect(unwrap(FeedLanguage.create("en-US"))).toBe("en-US");
  });

  it("accepts a language-script tag", () => {
    expect(unwrap(FeedLanguage.create("zh-Hant"))).toBe("zh-Hant");
  });

  it("canonicalizes casing", () => {
    expect(unwrap(FeedLanguage.create("en-us"))).toBe("en-US");
  });

  it("normalizes underscore separators (POSIX-style locale)", () => {
    expect(unwrap(FeedLanguage.create("en_US"))).toBe("en-US");
  });

  it("trims surrounding whitespace", () => {
    expect(unwrap(FeedLanguage.create("  ko  "))).toBe("ko");
  });

  it("rejects an empty string", () => {
    expect(unwrapErr(FeedLanguage.create(""))).toEqual({
      type: "InvalidFeedLanguage",
      raw: "",
    });
  });

  it("rejects text that is not a BCP-47 tag", () => {
    expect(unwrapErr(FeedLanguage.create("not a lang"))).toEqual({
      type: "InvalidFeedLanguage",
      raw: "not a lang",
    });
  });
});
