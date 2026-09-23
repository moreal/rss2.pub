import solid from "eslint-plugin-solid/configs/v2";
import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["eslint-plugin-solid"],
  settings: solid.settings,
  overrides: [
    {
      // Hono JSX has different semantics; only the Solid workspace receives
      // the Solid 2 preset.
      files: ["packages/web-ui/src/**/*.{ts,tsx}"],
      rules: solid.rules,
    },
    {
      // Product and federation page bodies are server-rendered once and are
      // never hydrated. Keep JSX correctness checks, but skip client-only
      // reactive-list and tracked-scope advice for these files.
      files: ["packages/web-ui/src/product/pages.tsx", "packages/web-ui/src/federation/pages.tsx"],
      rules: {
        "solid/prefer-for": "off",
        "solid/reactivity": "off",
        "solid/components-return-once": "off",
      },
    },
  ],
});
