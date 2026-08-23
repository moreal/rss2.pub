import { describe, expect, it } from "vitest";
import { toTemplateParts } from "../../../../src/infrastructure/federation/botkit-stack.js";

describe("toTemplateParts", () => {
  it("keeps a single text part as one string with no mentions", () => {
    expect(toTemplateParts([{ type: "text", value: "hello" }])).toEqual({
      strings: ["hello"],
      mentionHandles: [],
    });
  });

  it("merges adjacent text parts into one string segment", () => {
    expect(
      toTemplateParts([
        { type: "text", value: "a" },
        { type: "text", value: "b" },
      ]),
    ).toEqual({ strings: ["ab"], mentionHandles: [] });
  });

  it("splits a string segment around each mention, one more segment than handles", () => {
    expect(
      toTemplateParts([
        { type: "text", value: "Follow " },
        { type: "mention", handle: "@feed@rss2.test" },
        { type: "text", value: " to get new posts." },
      ]),
    ).toEqual({
      strings: ["Follow ", " to get new posts."],
      mentionHandles: ["@feed@rss2.test"],
    });
  });

  it("handles adjacent mentions with an empty string segment between them", () => {
    expect(
      toTemplateParts([
        { type: "mention", handle: "@a@rss2.test" },
        { type: "mention", handle: "@b@rss2.test" },
      ]),
    ).toEqual({
      strings: ["", "", ""],
      mentionHandles: ["@a@rss2.test", "@b@rss2.test"],
    });
  });

  it("returns a single empty segment for no parts", () => {
    expect(toTemplateParts([])).toEqual({ strings: [""], mentionHandles: [] });
  });
});
