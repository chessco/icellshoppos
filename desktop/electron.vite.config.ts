import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    resolve: {
      alias: {
        "@ireader/contracts": resolve("../packages/contracts/src/index.ts"),
        "@ireader/api-client": resolve("../packages/api-client/src/index.ts"),
        "@ireader/application": resolve("../packages/application/src/index.ts"),
      },
    },
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    resolve: {
      alias: {
        "@ireader/contracts": resolve("../packages/contracts/src/index.ts"),
      },
    },
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
        "@ireader/contracts": resolve("../packages/contracts/src/index.ts"),
        "@ireader/api-client": resolve("../packages/api-client/src/index.ts"),
        "@ireader/application": resolve("../packages/application/src/index.ts"),
      },
    },
    plugins: [react()],
  },
});
