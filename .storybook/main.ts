import type { StorybookConfig } from "storybook-solidjs-vite";

function countSolidPlugins(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((count: number, entry: unknown) => count + countSolidPlugins(entry), 0);
  }
  return value !== null && typeof value === "object" && "name" in value && value.name === "solid" ? 1 : 0;
}

const config: StorybookConfig = {
  framework: "storybook-solidjs-vite",
  core: { disableWhatsNewNotifications: true },
  features: { sidebarOnboardingChecklist: false },
  stories: ["../packages/web-ui/src/**/*.stories.tsx"],
  async viteFinal(viteConfig) {
    const count = countSolidPlugins(viteConfig.plugins);
    if (count !== 1) {
      throw new Error(`Expected one Solid compiler in Storybook, found ${count}`);
    }
    return viteConfig;
  },
};

export default config;
