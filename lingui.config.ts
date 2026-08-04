import { defineConfig } from "@lingui/cli";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "./src/web/locale.js";

export default defineConfig({
  locales: [...SUPPORTED_LOCALES],
  sourceLocale: DEFAULT_LOCALE,
  fallbackLocales: { default: DEFAULT_LOCALE },
  catalogs: [
    {
      path: "<rootDir>/src/web/locales/{locale}",
      include: ["src/web"],
    },
  ],
  // Emits .ts catalogs so plain tsc/tsx can consume them (no bundler here).
  compileNamespace: "ts",
});
