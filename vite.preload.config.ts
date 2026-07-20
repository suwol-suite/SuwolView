import { builtinModules } from "node:module";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const external = [
  "electron",
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`)
];

export default defineConfig({
  build: {
    outDir: "dist-electron",
    emptyOutDir: false,
    minify: false,
    sourcemap: true,
    target: "node22",
    rollupOptions: {
      external,
      input: resolve(__dirname, "src/preload/preload.ts"),
      output: {
        format: "cjs",
        entryFileNames: "preload.cjs"
      }
    }
  }
});
