import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
export default defineConfig({
  base: process.env.LUNARIS_BUILD_ID ? `/bundles/${process.env.LUNARIS_BUILD_ID}/` : "/",
  clearScreen: false,
  define: { __LUNARIS_BUILD_ID__: JSON.stringify(process.env.LUNARIS_BUILD_ID ?? "development"), __LUNARIS_FEATURES__: process.env.LUNARIS_FEATURES ?? '["editor","files","settings"]' },
  plugins: [{ name: "lunaris-startup-art", transformIndexHtml(html) {
    const art = readFileSync(new URL("../../resources/ascii_art.txt", import.meta.url), "utf8");
    return html.replace("<!-- lunaris:startup-art -->", art.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"));
  } }],
  server: { proxy: { "/api": "http://127.0.0.1:3100" } },
  build: { outDir: "web-dist", target: "es2022", emptyOutDir: true, rolldownOptions: { onLog(level, log, handler) {
    if (log.code === "MODULE_LEVEL_DIRECTIVE" && log.message.includes('"use client"') && /node_modules[/\\]@mantine[/\\]/.test(log.id ?? log.message)) return;
    handler(level, log);
  } } },
});
