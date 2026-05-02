import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://borderbrowser.example",
  trailingSlash: "never",
  build: {
    format: "file",
  },
});
