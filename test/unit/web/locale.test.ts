import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  LOCALE_META,
  neutralLocalePath,
  SUPPORTED_LOCALES,
  resolveLocale,
  switchLocalePath,
} from "../../../src/web/locale.js";

describe("resolveLocale", () => {
  it.each([
    ["ja", "ja"],
    ["ko-KR", "ko"],
    ["zh-CN", "zh-Hans-CN"],
    ["zh-Hans", "zh-Hans-CN"],
    ["zh-Hans-TW", "zh-Hans-CN"],
    ["zh-TW", "zh-Hant-TW"],
    ["zh-Hant", "zh-Hant-TW"],
    ["zh-Hant-CN", "zh-Hant-TW"],
    ["de-DE", "de"],
    ["fr-FR", "fr"],
    ["es-ES", "es"],
    ["it-IT", "it"],
    ["nl-NL", "nl"],
    ["pl-PL", "pl"],
    ["pt-PT", "pt-PT"],
  ] as const)("maps %s to %s", (value, expected) => {
    expect(resolveLocale(value)).toBe(expected);
  });

  it("provides a stable short label and direction for every locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(LOCALE_META[locale].shortLabel.length).toBeGreaterThan(0);
      expect(LOCALE_META[locale].direction).toBe("ltr");
    }
  });

  it.each([...SUPPORTED_LOCALES])(
    "accepts the supported locale %s",
    (locale) => {
      expect(resolveLocale(locale)).toBe(locale);
    },
  );

  it.each(["", "xx-YY", "und"])(
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
