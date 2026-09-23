import { createDecorator, type Preview } from "storybook-solidjs-vite";
import { DARK_TOKENS, LIGHT_TOKENS, STYLE } from "../src/web/ui/styles.js";
import "../packages/web-ui/src/locale-picker.css";

// The app and Storybook compose the same explicit declarations. Storybook's
// theme toolbar overrides the OS preference without parsing generated CSS.
const styles = document.createElement("style");
styles.textContent = `${STYLE}\n:root[data-storybook-theme="light"] { ${LIGHT_TOKENS} }\n:root[data-storybook-theme="dark"] { ${DARK_TOKENS} }`;
document.head.append(styles);

const preview: Preview = {
  parameters: {
    options: { storySort: { order: ["Design system", "Foundations", "Navigation"] } },
  },
  globalTypes: {
    theme: {
      description: "Inspect the shared product palette",
      toolbar: {
        title: "Theme",
        icon: "paintbrush",
        dynamicTitle: true,
        items: [
          { value: "story", title: "Story theme" },
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
      },
    },
  },
  initialGlobals: { theme: "story" },
  decorators: [
    createDecorator((Story, context) => {
      const requested = context.globals.theme === "story" ? context.parameters.theme : context.globals.theme;
      const theme = requested === "dark" ? "dark" : "light";
      document.documentElement.dataset.storybookTheme = theme;
      document.documentElement.dir = context.parameters.direction === "rtl" ? "rtl" : "ltr";
      document.documentElement.style.colorScheme = theme;
      return Story();
    }),
  ],
};

export default preview;
