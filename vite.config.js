import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { readFileSync } from "node:fs";

const buildTimestampIso = new Date().toISOString();
const buildCommit = process.env.GITHUB_SHA?.slice(0, 7) ?? "";
const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  plugins: [vue()],
  define: {
    __APP_BUILD_INFO__: JSON.stringify({
      builtAt: buildTimestampIso,
      commit: buildCommit,
      version: packageJson.version ?? "0.0.0",
    }),
  },
});
