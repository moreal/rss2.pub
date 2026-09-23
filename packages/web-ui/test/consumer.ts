import { renderLocalePicker, type LocalePickerProps } from "@rss2pub/web-ui/server";

const props: LocalePickerProps = {
  currentLocale: "en",
  currentShortLabel: "EN",
  buttonLabel: "Change language",
  options: [{ locale: "en", label: "English", href: "/?lang=en" }],
};

renderLocalePicker(props);
