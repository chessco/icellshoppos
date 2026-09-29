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
    // electron-updater/electron-store/bplist-parser are pure-JS and hoisted to
    // the monorepo root's node_modules — the packaged app has no node_modules
    // at all (see build.files below), so externalizing them would leave a
    // dangling `require()` that crashes on launch. Bundle them directly
    // instead; only `electron` itself (and other truly native modules, none
    // currently) needs to stay external.
    plugins: [externalizeDepsPlugin({ exclude: ["electron-updater", "electron-store", "bplist-parser"] })],
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
