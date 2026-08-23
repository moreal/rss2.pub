import { describe, expect, it } from "vitest";
import { IconUrl } from "../../../../src/domain/feed/icon-url.js";
import { unwrap, unwrapErr } from "../../../helpers/result.js";

describe("IconUrl.create", () => {
  it("accepts an absolute http(s) URL", () => {
    expect(unwrap(IconUrl.create("https://example.com/favicon.ico"))).toBe(
      "https://example.com/favicon.ico",
    );
  });

  it("rejects text that is not a URL", () => {
    expect(unwrapErr(IconUrl.create("not a url"))).toEqual({
      type: "NotAUrl",
      raw: "not a url",
    });
  });

  it("rejects non-http(s) protocols", () => {
    expect(unwrapErr(IconUrl.create("data:image/png;base64,abcd"))).toMatchObject({
      type: "UnsupportedProtocol",
      protocol: "data:",
    });
  });
});
