import { definePlugin } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { DocumentProtection } from "@lunaris/active-document";
import { ApplicationReload } from "@lunaris/remote";
export function createBrowserNavigation(view: Window = window) {
  return definePlugin({ manifest: { manifestVersion: 1, id: "lunaris.browser-navigation", version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./dist/index.js",
    provides: [{ kind: ApplicationReload.kind, id: ApplicationReload.id, version: ApplicationReload.version }],
    requires: [{ kind: Logger.kind, id: Logger.id, range: "^1.0.0" }, { kind: DocumentProtection.kind, id: DocumentProtection.id, range: "^1.0.0", optional: true }],
    permissions: ["application.native", "vault.access"], optionalPermissions: [] }, activate(ctx) {
    const logger = ctx.use(Logger); const protection = ctx.optional(DocumentProtection);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!ctx.signal.aborted && protection?.hasUnprotectedChanges()) { event.preventDefault(); event.returnValue = ""; }
    };
    view.addEventListener("beforeunload", beforeUnload); ctx.scope.own({ dispose() { view.removeEventListener("beforeunload", beforeUnload); } });
    ctx.provide(ApplicationReload, { reload() { logger.info(ctx.pluginId, "Browser reload requested"); view.location.reload(); } });
    logger.info(ctx.pluginId, "Browser navigation driver ready");
  } });
}
