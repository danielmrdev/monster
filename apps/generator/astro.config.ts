import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

const slug = process.env.SITE_SLUG ?? "default";

export default defineConfig({
  output: "static",
  outDir: `.generated-sites/${slug}/dist`,
  vite: {
    plugins: [tailwindcss()],
  },
});
