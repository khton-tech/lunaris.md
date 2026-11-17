import { definePlugin } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { PluginExecution, PluginLoader } from "@lunaris/execution";
import type { PluginExecutionApi } from "@lunaris/execution";
import { createRealm } from "./realm.js";
import { isolatedDefinition } from "./sdk-bridge.js";

export default definePlugin({
  manifest: {
    manifestVersion: 1, id: "lunaris.quickjs-execution", version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./dist/index.js",
    provides: [PluginExecution, PluginLoader].map(token => ({ kind: token.kind, id: token.id, version: token.version })),
    requires: [{ kind: Logger.kind, id: Logger.id, range: "^1.0.0" }], permissions: [], optionalPermissions: [],
  },
  activate(ctx) {
    const logger = ctx.use(Logger);
    const load: PluginExecutionApi["load"] =
      (manifest, source, environment, owner, limits) => isolatedDefinition(manifest, source, environment, owner, ctx.signal, limits);
    ctx.provide(PluginLoader, { load });
    ctx.provide(PluginExecution, {
      load,
      async create(identity, source, capabilities, owner, limits) {
      try {
        const realm = await createRealm(identity, source, capabilities, owner, ctx.signal, limits);
        if (ctx.signal.aborted) { realm.dispose(); throw new Error("Execution driver stopped."); }
        logger.info(ctx.pluginId, "Plugin execution realm ready", { data: { pluginId: identity.pluginId, generation: identity.generation } });
        return realm;
      } catch (error) {
        if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Plugin execution realm failed", { error, data: { pluginId: identity.pluginId } });
        throw error;
      }
    } });
    logger.info(ctx.pluginId, "QuickJS execution driver ready");
  },
});
