import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  // dts via tsup fails on the Supabase generic type helpers (TS2536 preexisting).
  // We generate declarations separately with `tsc --noEmitOnError false`.
  dts: false,
  clean: true,
  sourcemap: false,
});
