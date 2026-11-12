import { definePlugin } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { ExternalLinks, ExternalLinksDriver, externalUrl } from "@lunaris/external-links";

export default definePlugin({ manifest: { manifestVersion: 1, id: "lunaris.external-links-provider", version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./dist/src/index.js",
  provides: [{ kind: "api", id: ExternalLinks.id, version: ExternalLinks.version }], requires: [Logger, ExternalLinksDriver].map(token => ({ kind: "api", id: token.id, range: "^1.0.0" })), permissions: ["links.open"], optionalPermissions: [] }, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal); const driver = ctx.use(ExternalLinksDriver);
  ctx.provide(ExternalLinks, { open(value) {
    const url = externalUrl(value);
    if (!url) { logger.warn(ctx.pluginId, "Rejected unsupported external link"); return Promise.resolve({ ok: false, error: { code: "INVALID_URL", message: "Unsupported external link." } }); }
    // Invoke synchronously, before awaiting, to preserve browser user activation.
    return driver.open(url);
  } });
  logger.info(ctx.pluginId, "External link provider ready");
} });
