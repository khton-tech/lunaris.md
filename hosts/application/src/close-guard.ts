import { definePlugin } from "@lunaris/sdk";
import { Vault } from "@lunaris/vault";
import { Logger } from "@lunaris/logging";

/** Host bridge uses the same public Vault transition as product navigation. */
export function createCloseGuard() {
  let close: (() => Promise<boolean>) | undefined;
  const plugin = definePlugin({ manifest: {
    manifestVersion: 1, id: "lunaris.application-close", version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./close-guard.js",
    provides: [], requires: [Vault, Logger].map(token => ({ kind: "api" as const, id: token.id, range: `^${token.version}` })),
    permissions: ["vault.access"], optionalPermissions: [],
  }, activate(ctx) {
    const vault = ctx.use(Vault); const logger = ctx.use(Logger);
    close = async () => {
      if (ctx.signal.aborted) return true;
      const result = await vault.close();
      if (result.ok) return true;
      if (!ctx.signal.aborted) logger.warn(ctx.pluginId, "Window close blocked; document remains available", { error: result.error });
      return false;
    };
    ctx.scope.own({ dispose() { close = undefined; } });
    logger.info(ctx.pluginId, "Application preservation guard ready");
  } });
  return { plugin, beforeClose: async () => close ? close() : true };
}
