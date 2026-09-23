import { type I18n, type MessageDescriptor, setupI18n } from "@lingui/core";
import type { Locale } from "./locale.js";
import { messages as de } from "./locales/de.js";
import { messages as en } from "./locales/en.js";
import { messages as es } from "./locales/es.js";
import { messages as fr } from "./locales/fr.js";
import { messages as it } from "./locales/it.js";
import { messages as ja } from "./locales/ja.js";
import { messages as ko } from "./locales/ko.js";
import { messages as nl } from "./locales/nl.js";
import { messages as pl } from "./locales/pl.js";
import { messages as ptPT } from "./locales/pt-PT.js";
import { messages as zhHansCN } from "./locales/zh-Hans-CN.js";
import { messages as zhHantTW } from "./locales/zh-Hant-TW.js";

// One instance per locale, built at startup and shared across requests. Safe
// because nothing calls activate()/load() afterwards — treat as immutable.
// `Record<Locale, …>` keeps a new locale from compiling until it is wired.
const INSTANCES: Record<Locale, I18n> = {
  en: setupI18n({ locale: "en", messages: { en } }),
  ko: setupI18n({ locale: "ko", messages: { ko } }),
  ja: setupI18n({ locale: "ja", messages: { ja } }),
  "zh-Hans-CN": setupI18n({ locale: "zh-Hans-CN", messages: { "zh-Hans-CN": zhHansCN } }),
  "zh-Hant-TW": setupI18n({ locale: "zh-Hant-TW", messages: { "zh-Hant-TW": zhHantTW } }),
  de: setupI18n({ locale: "de", messages: { de } }),
  fr: setupI18n({ locale: "fr", messages: { fr } }),
  es: setupI18n({ locale: "es", messages: { es } }),
  it: setupI18n({ locale: "it", messages: { it } }),
  nl: setupI18n({ locale: "nl", messages: { nl } }),
  pl: setupI18n({ locale: "pl", messages: { pl } }),
  "pt-PT": setupI18n({ locale: "pt-PT", messages: { "pt-PT": ptPT } }),
};

export function i18nFor(locale: Locale): I18n {
  return INSTANCES[locale];
}

/** A message carries ICU placeholders iff its text contains a `{`. */
type HasPlaceholders<M> = M extends `${string}{${string}` ? true : false;

/**
 * Values are required exactly when the message has placeholders. Without
 * this, `translate(i18n, copy.feedFollowers)` compiles and renders
 * "NaN followers" — ICU substitutes `undefined` silently.
 *
 * A descriptor whose text is not statically known (a `MessageDescriptor`
 * passed through a prop, say) falls back to optional rather than failing.
 */
type ValuesArg<D extends MessageDescriptor> =
  HasPlaceholders<D["message"]> extends true
    ? [values: Record<string, unknown>]
    : [values?: Record<string, unknown>];

export function translate<D extends MessageDescriptor>(
  i18n: I18n,
  message: D,
  ...values: ValuesArg<D>
): string {
  return i18n._({ ...message, values: values[0] ?? {} });
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
  translator: I18n,
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
  return translator
    ._({ ...message, values: { ...values, ...markers } })
    .split(SLOT_MARKER)
    .map((part, index) =>
      index % 2 === 0 ? part : (entries[Number(part)]?.[1] ?? ""),
    );
}
