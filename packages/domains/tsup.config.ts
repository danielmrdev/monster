import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  target: "node20",
  external: ["cloudflare"],
  clean: true,
  sourcemap: false,
});
