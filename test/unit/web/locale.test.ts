import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  neutralLocalePath,
  SUPPORTED_LOCALES,
  resolveLocale,
  switchLocalePath,
} from "../../../src/web/locale.js";

describe("resolveLocale", () => {
  it.each([...SUPPORTED_LOCALES])(
    "accepts the supported locale %s",
    (locale) => {
      expect(resolveLocale(locale)).toBe(locale);
    },
  );

  // These are post-negotiation inputs: hono's own detector lowercases and
  // strips region tags first, so "ko-KR" reaching here means the middleware
  // did not run. Falling back to the default is the right answer for all of
  // them — see routes.test.ts for what a real "ko-KR" request resolves to.
  it.each(["fr", "", "ko-KR", "EN"])(
    "falls back to the default locale for the unnegotiated value %j",
    (value) => {
      expect(resolveLocale(value)).toBe(DEFAULT_LOCALE);
    },
  );
});

describe("switchLocalePath", () => {
  it.each([
    { path: "/", expected: "/?lang=ko" },
    { path: "/search?q=abc", expected: "/search?q=abc&lang=ko" },
    { path: "/?lang=en", expected: "/?lang=ko" },
  ])("rewrites $path to $expected", ({ path, expected }) => {
    expect(switchLocalePath(path, "ko")).toBe(expected);
  });
});

describe("neutralLocalePath", () => {
  it.each([
    { path: "/", expected: "/" },
    // The x-default URL must negotiate, so an inherited ?lang= has to go.
    { path: "/?lang=ko", expected: "/" },
    { path: "/search?q=abc&lang=ko", expected: "/search?q=abc" },
    { path: "/search?q=abc", expected: "/search?q=abc" },
  ])("strips the locale from $path", ({ path, expected }) => {
    expect(neutralLocalePath(path)).toBe(expected);
  });
});
