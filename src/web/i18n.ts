import { type I18n, type MessageDescriptor, setupI18n } from "@lingui/core";
import type { Locale } from "./locale.js";
import { messages as en } from "./locales/en.js";
import { messages as ko } from "./locales/ko.js";

// One instance per locale, built at startup and shared across requests. Safe
// because nothing calls activate()/load() afterwards — treat as immutable.
// `Record<Locale, …>` keeps a new locale from compiling until it is wired.
const INSTANCES: Record<Locale, I18n> = {
  en: setupI18n({ locale: "en", messages: { en } }),
  ko: setupI18n({ locale: "ko", messages: { ko } }),
};

export function i18nFor(locale: Locale): I18n {
  return INSTANCES[locale];
}

export function translate(
  i18n: I18n,
  message: MessageDescriptor,
  values: Record<string, unknown> = {},
): string {
  return i18n._({ ...message, values });
}

// NUL never occurs in real copy, so splitting on it is unambiguous.
const SLOT_MARKER = "\u0000";

/**
 * Formats a message whose placeholders are rendered elements (chips, links...)
 * rather than strings. ICU substitutes a marker per placeholder; the result is
 * split so the caller's elements are interleaved with the translated text
 * runs, letting translators reorder placeholders freely.
 *
 * `slots` is only for rendered elements — anything ICU itself must read
 * (plural counts, numbers, dates) belongs in `values`, because a slot is
 * replaced by a marker string before ICU ever sees it and a number passed as
 * a slot would format as `NaN`.
 *
 * Slots are opaque: an element can sit between text runs but cannot wrap one.
 * A message like "read the <a>docs</a>" needs tag placeholders instead — add
 * them here rather than splitting the sentence across several messages.
 */
export function translateWithSlots<T>(
  i18n: I18n,
  message: MessageDescriptor,
  slots: Record<string, T>,
  values: Record<string, unknown> = {},
): (string | T)[] {
  const entries = Object.entries(slots);
  const markers = Object.fromEntries(
    entries.map(([name], index) => [
      name,
      `${SLOT_MARKER}${index}${SLOT_MARKER}`,
    ]),
  );
  return i18n
    ._({ ...message, values: { ...values, ...markers } })
    .split(SLOT_MARKER)
    .map((part, index) =>
      index % 2 === 0 ? part : (entries[Number(part)]?.[1] ?? ""),
    );
}
