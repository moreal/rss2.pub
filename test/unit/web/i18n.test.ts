import { describe, expect, it } from "vitest";
import { i18nFor, translate, translateWithSlots } from "../../../src/web/i18n.js";
import { SUPPORTED_LOCALES } from "../../../src/web/locale.js";
import { copy } from "../../../src/web/ui/messages.js";

const DESCRIPTORS = Object.values(copy);

/**
 * Compile-time guard. `translate()` decides whether ICU values are mandatory
 * by reading each message's literal text, so dropping `as const` in
 * messages.ts would turn that check off without failing anything at runtime.
 * If the literals widen to `string`, the annotation below becomes `never` and
 * this file stops compiling.
 */
export const MESSAGE_LITERALS_SURVIVE: string extends
  typeof copy.feedFollowers.message
  ? never
  : true = true;

describe("translate", () => {
  it.each([
    { locale: "en", expected: "Register a feed" },
    { locale: "ko", expected: "피드 등록" },
  ] as const)("renders $locale", ({ locale, expected }) => {
    expect(translate(i18nFor(locale), copy.registerHeading)).toBe(expected);
  });

  it.each([
    { locale: "en", count: 1, expected: "1 follower" },
    { locale: "en", count: 2, expected: "2 followers" },
    { locale: "ko", count: 1, expected: "팔로워 1명" },
    { locale: "ko", count: 7, expected: "팔로워 7명" },
  ] as const)(
    "applies $locale plural rules to $count",
    ({ locale, count, expected }) => {
      expect(translate(i18nFor(locale), copy.feedFollowers, { count })).toBe(
        expected,
      );
    },
  );

  it("interpolates plain string values", () => {
    expect(
      translate(i18nFor("ko"), copy.registerErrorNotAUrl, { url: "nope" }),
    ).toBe("URL 형식이 아닌 것 같습니다: nope");
  });

  it.each([
    {
      locale: "en",
      expected: [
        "Follow Atom feeds from the fediverse.",
        "Follow any Atom feed from the fediverse",
        "rss2.pub turns an Atom feed into a fediverse account anyone can follow.",
        "The address of the Atom feed itself, not the website — it often ends in /atom or .xml.",
        "Couldn’t read an Atom feed there: boom",
      ],
    },
    {
      locale: "ko",
      expected: [
        "페디버스에서 Atom 피드를 팔로우하세요.",
        "페디버스에서 어떤 Atom 피드든 팔로우하세요",
        "rss2.pub은 Atom 피드를 누구나 팔로우할 수 있는 페디버스 계정으로 바꿉니다.",
        "웹사이트가 아니라 Atom 피드 자체의 주소를 입력하세요. 보통 /atom 또는 .xml로 끝납니다.",
        "해당 주소에서 Atom 피드를 읽을 수 없습니다: boom",
      ],
    },
  ] as const)("renders Atom-only product copy in $locale", ({ locale, expected }) => {
    const i18n = i18nFor(locale);
    expect([
      translate(i18n, copy.layoutMetaDescription),
      translate(i18n, copy.homeHeading),
      translate(i18n, copy.layoutFooterSummary),
      translate(i18n, copy.registerUrlHelp),
      translate(i18n, copy.registerErrorFeedUnreachable, { message: "boom" }),
    ]).toEqual(expected);
  });
});

describe("translateWithSlots", () => {
  it("interleaves slot values between translated text runs", () => {
    const parts = translateWithSlots(i18nFor("en"), copy.registerBotAlt, {
      handle: "@rss2pub@example.com",
      command: "register <url>",
    });
    expect(parts.join("")).toBe(
      "Prefer the fediverse? Mention @rss2pub@example.com with register <url>.",
    );
  });

  it("follows the translated placeholder order in Korean", () => {
    const parts = translateWithSlots(i18nFor("ko"), copy.registerBotAlt, {
      handle: "H",
      command: "C",
    });
    expect(parts.join("")).toBe(
      "페디버스가 더 편하다면 H 계정에 C 명령을 멘션하세요.",
    );
  });

  it("keeps slot values by reference so rendered elements survive", () => {
    const handle = { element: "chip" };
    const parts = translateWithSlots(i18nFor("ko"), copy.layoutFooterBot, {
      handle,
    });
    expect(parts).toContain(handle);
  });

  it("routes ICU values separately from element slots", () => {
    // Regression guard: a count passed as a *slot* would become a marker
    // string and format as NaN. It belongs in `values`.
    const message = {
      id: "test.mixed",
      message: "{count, plural, one {# feed by {who}} other {# feeds by {who}}}",
    };
    const parts = translateWithSlots(
      i18nFor("en"),
      message,
      { who: "<chip>" },
      { count: 3 },
    );
    expect(parts.join("")).toBe("3 feeds by <chip>");
    expect(parts.join("")).not.toContain("NaN");
  });
});

describe("catalogs", () => {
  const declaredIds = DESCRIPTORS.map((descriptor) => descriptor.id).sort();

  // Total by construction: a new locale is covered without touching the test.
  it.each([...SUPPORTED_LOCALES])(
    "%s holds exactly the declared messages",
    (locale) => {
      expect(Object.keys(i18nFor(locale).messages).sort()).toEqual(declaredIds);
    },
  );

  // The compiled catalog — not messages.ts — is what users read. Editing copy
  // without re-running extract+compile would otherwise ship the old text.
  it.each(
    DESCRIPTORS.filter((descriptor) => !descriptor.message.includes("{")).map(
      (descriptor) => ({ id: descriptor.id, message: descriptor.message }),
    ),
  )("en catalog is in sync with the source of $id", ({ id, message }) => {
    expect(translate(i18nFor("en"), { id, message: "" })).toBe(message);
  });

  // `fallbackLocales` fills an untranslated message with English, leaving the
  // key present — so key-set equality alone cannot catch a missing translation.
  it.each(declaredIds)("%s is actually translated in ko", (id) => {
    const ko = i18nFor("ko").messages[id];
    const en = i18nFor("en").messages[id];
    expect(JSON.stringify(ko)).not.toBe(JSON.stringify(en));
  });
});
