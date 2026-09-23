/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { LocalePicker, type LocaleOption } from "./locale-picker.js";

const options: readonly LocaleOption[] = [
  { locale: "en", label: "English", href: "?lang=en" },
  { locale: "ko", label: "한국어", href: "?lang=ko" },
  { locale: "ja", label: "日本語", href: "?lang=ja" },
  { locale: "zh-Hant-TW", label: "繁體中文（台灣）", href: "?lang=zh-Hant-TW" },
  { locale: "pt-PT", label: "Português (Portugal)", href: "?lang=pt-PT" },
];

const meta = {
  title: "Navigation/Locale picker",
  component: LocalePicker,
  args: {
    currentLocale: "en",
    currentShortLabel: "EN",
    buttonLabel: "Choose language",
    options,
  },
} satisfies Meta<typeof LocalePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EnglishLight: Story = {
  args: { currentShortLabel: "EN" },
  parameters: { theme: "light" },
};
export const EnglishDark: Story = {
  args: { currentShortLabel: "EN" },
  parameters: { theme: "dark" },
};

export const KoreanLight: Story = {
  args: { currentLocale: "ko", currentShortLabel: "KO", buttonLabel: "언어 선택" },
  parameters: { theme: "light" },
};
export const KoreanDark: Story = {
  args: { currentLocale: "ko", currentShortLabel: "KO", buttonLabel: "언어 선택" },
  parameters: { theme: "dark" },
};

export const TraditionalChineseLight: Story = {
  args: { currentLocale: "zh-Hant-TW", currentShortLabel: "ZH-TW", buttonLabel: "選擇語言" },
  parameters: { theme: "light" },
};
export const TraditionalChineseDark: Story = {
  args: { currentLocale: "zh-Hant-TW", currentShortLabel: "ZH-TW", buttonLabel: "選擇語言" },
  parameters: { theme: "dark" },
};

const longLabelOptions: readonly LocaleOption[] = [
  ...options,
  {
    locale: "de-test",
    label: "Deutsch — eine absichtlich sehr lange Sprachbezeichnung",
    href: "?lang=de-test",
  },
];

export const LongLabelLight: Story = {
  args: { currentLocale: "de-test", currentShortLabel: "DE", options: longLabelOptions },
  parameters: { theme: "light" },
};
export const LongLabelDark: Story = {
  args: { currentLocale: "de-test", currentShortLabel: "DE", options: longLabelOptions },
  parameters: { theme: "dark" },
};

export const JapaneseLight: Story = {
  args: { currentLocale: "ja", currentShortLabel: "JA", buttonLabel: "言語を選択" },
  parameters: { theme: "light" },
};
export const JapaneseDark: Story = {
  args: { currentLocale: "ja", currentShortLabel: "JA", buttonLabel: "言語を選択" },
  parameters: { theme: "dark" },
};

// Synthetic stress fixture: Arabic is not a supported product locale yet.
const rtlOptions: readonly LocaleOption[] = [
  ...options,
  { locale: "ar", label: "العربية", href: "?lang=ar" },
];
export const RtlBidiLight: Story = {
  args: { currentLocale: "ar", currentShortLabel: "AR", buttonLabel: "اختيار اللغة", options: rtlOptions },
  parameters: { theme: "light", direction: "rtl" },
};
export const RtlBidiDark: Story = {
  args: { currentLocale: "ar", currentShortLabel: "AR", buttonLabel: "اختيار اللغة", options: rtlOptions },
  parameters: { theme: "dark", direction: "rtl" },
};
