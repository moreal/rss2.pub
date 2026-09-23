import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const server = mode === "server";
  return {
    root: import.meta.dirname,
    plugins: [solid({ ssr: true })],
    build: {
      outDir: server ? "dist/server" : "dist/client",
      emptyOutDir: true,
      manifest: !server,
      ...(server
        ? {
            ssr: "src/server.tsx",
            rolldownOptions: { output: { entryFileNames: "server.js" } },
          }
        : {
            rolldownOptions: {
              input: "src/client.tsx",
              output: {
                entryFileNames: "assets/[name]-[hash].js",
                assetFileNames: "assets/[name]-[hash][extname]",
              },
            },
          }),
    },
  };
});
