import { defineConfig } from "astro/config";

// Static output — server-rendered HTML, great SEO, fast on Vercel. The
// community report API lives as a Vercel serverless function in /api.
export default defineConfig({
  site: "https://vev-browser.vercel.app",
  compressHTML: true,
});
