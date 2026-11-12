import { openUrl } from "@tauri-apps/plugin-opener";
import { definePlugin } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { ExternalLinksDriver, externalUrl } from "@lunaris/external-links";

export function createTauriLinks(open: (url: string) => Promise<void> = openUrl) {
  return definePlugin({ manifest: { manifestVersion: 1, id: "lunaris.tauri-links", version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./dist/src/index.js",
    provides: [{ kind: "api", id: ExternalLinksDriver.id, version: ExternalLinksDriver.version }], requires: [{ kind: "api", id: Logger.id, range: "^1.0.0" }], permissions: ["links.native"], optionalPermissions: [] }, activate(ctx) {
    const logger = scopeLogger(ctx.use(Logger), ctx.signal);
    ctx.provide(ExternalLinksDriver, { async open(value) {
      const url = externalUrl(value); if (!url) return { ok: false, error: { code: "INVALID_URL", message: "Unsupported external link." } };
      try {
        await open(url);
        if (ctx.signal.aborted) return { ok: false, error: { code: "CANCELLED", message: "Link driver stopped." } };
        logger.info(ctx.pluginId, "External link opened in the system application"); return { ok: true, value: null };
      } catch (error) {
        if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot open external link", { error });
        return { ok: false, error: { code: "FAILED", message: "The system could not open this link." } };
      }
    } });
    logger.info(ctx.pluginId, "Native link driver ready");
  } });
}
