import { defineConfig } from "vite";
import { readFileSync } from "node:fs";

export default defineConfig({
  clearScreen: false,
  plugins: [{
    name: "lunaris-startup-art",
    transformIndexHtml(html) {
      // Both dev and packaged HTML present the existing artwork before JS loads.
      const art = readFileSync(new URL("../../resources/ascii_art.txt", import.meta.url), "utf8");
      const escaped = art.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
      return html.replace("<!-- lunaris:startup-art -->", escaped);
    },
  }],
  server: { host: "127.0.0.1", port: 1420, strictPort: true },
  build: {
    outDir: "web-dist", target: "es2022", emptyOutDir: true,
    rolldownOptions: {
      onLog(level, log, handler) {
        // This host is entirely client-rendered; Mantine's RSC markers carry no boundary here.
        if (log.code === "MODULE_LEVEL_DIRECTIVE" && log.message.includes('"use client"') && /node_modules[/\\]@mantine[/\\]/.test(log.id ?? log.message)) return;
        handler(level, log);
      },
    },
  },
});
