/** @jsxImportSource @solidjs/web */
import { hydrate } from "@solidjs/web";
import { LocalePicker, type LocalePickerProps } from "./locale-picker.js";
import "./locale-picker.css";

function parseProps(value: unknown): LocalePickerProps {
  if (typeof value !== "object" || value === null || !("currentLocale" in value) || !("currentShortLabel" in value) || !("buttonLabel" in value) || !("options" in value)) {
    throw new Error("Invalid locale picker props");
  }
  const { currentLocale, currentShortLabel, buttonLabel, options } = value;
  if (typeof currentLocale !== "string" || typeof currentShortLabel !== "string" || typeof buttonLabel !== "string" || !Array.isArray(options) || !options.every((item: unknown) =>
    typeof item === "object" && item !== null && "locale" in item && typeof item.locale === "string" && "label" in item && typeof item.label === "string" && "href" in item && typeof item.href === "string")) {
    throw new Error("Invalid locale picker props");
  }
  return { currentLocale, currentShortLabel, buttonLabel, options };
}

const root = document.getElementById("picker");
const fallback = document.getElementById("picker-fallback");
const payload = document.getElementById("picker-props");
if (root === null || fallback === null || payload?.textContent === null || payload?.textContent === undefined) {
  throw new Error("Missing locale picker hydration data");
}
const props = parseProps(JSON.parse(payload.textContent));
hydrate(() => <LocalePicker {...props} />, root);
fallback.hidden = true;
root.hidden = false;
