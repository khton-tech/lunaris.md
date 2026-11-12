import { definePlugin } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { ExternalLinksDriver, externalUrl } from "@lunaris/external-links";

export function createBrowserLinks(port: { open(url: string, target: string, features: string): unknown } = window) {
  return definePlugin({ manifest: { manifestVersion: 1, id: "lunaris.browser-links", version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./dist/src/index.js",
    provides: [{ kind: "api", id: ExternalLinksDriver.id, version: ExternalLinksDriver.version }], requires: [{ kind: "api", id: Logger.id, range: "^1.0.0" }], permissions: ["links.native"], optionalPermissions: [] }, activate(ctx) {
    const logger = scopeLogger(ctx.use(Logger), ctx.signal);
    ctx.provide(ExternalLinksDriver, { async open(value) {
      const url = externalUrl(value); if (!url) return { ok: false, error: { code: "INVALID_URL", message: "Unsupported external link." } };
      try {
        port.open(url, "_blank", "noopener,noreferrer");
        logger.info(ctx.pluginId, "External link dispatched to browser"); return { ok: true, value: null };
      } catch (error) { logger.error(ctx.pluginId, "Cannot open external link", { error }); return { ok: false, error: { code: "FAILED", message: "The browser could not open this link." } }; }
    } });
    logger.info(ctx.pluginId, "Browser link driver ready");
  } });
}
