import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";

// Storybook's Vite builder loads this config before the Solid framework preset.
// The app keeps its separate SSR/client build targets in packages/web-ui.
export default defineConfig({ plugins: [solid()] });
