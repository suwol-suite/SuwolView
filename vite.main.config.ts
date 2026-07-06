import { builtinModules } from "node:module";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const external = [
  "electron",
  "electron-updater",
  "exifr",
  "sharp",
  "yauzl",
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`)
];

export default defineConfig({
  build: {
    outDir: "dist-electron",
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    target: "node22",
    rollupOptions: {
      external,
      input: {
        main: resolve(__dirname, "src/main/main.ts"),
        preload: resolve(__dirname, "src/preload/preload.ts"),
        thumbnailWorker: resolve(__dirname, "src/main/workers/thumbnailWorker.ts"),
        metadataWorker: resolve(__dirname, "src/main/workers/metadataWorker.ts")
      },
      output: {
        format: "cjs",
        entryFileNames: "[name].cjs",
        chunkFileNames: "chunks/[name]-[hash].cjs"
      }
    }
  }
});
