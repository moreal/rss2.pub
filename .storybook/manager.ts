import { addons } from "storybook/manager-api";

// Give the foundations and component specimens the canvas on first visit.
// Controls remain available from the toolbar when inspecting component args.
addons.setConfig({ showPanel: false });
