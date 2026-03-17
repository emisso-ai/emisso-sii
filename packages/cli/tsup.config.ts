import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "bin/sii.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  external: ["@emisso/sii", "@emisso/cli-core"],
});
