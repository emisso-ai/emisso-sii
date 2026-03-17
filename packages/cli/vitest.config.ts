import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: {
      "@emisso/sii": path.resolve(__dirname, "../engine/src/index.ts"),
    },
  },
});
