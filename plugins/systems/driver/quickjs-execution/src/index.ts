import { definePlugin } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { PluginExecution } from "@lunaris/execution";
import { createRealm } from "./realm.js";
import { isolatedDefinition } from "./sdk-bridge.js";

export default definePlugin({
  manifest: {
    manifestVersion: 1, id: "lunaris.quickjs-execution", version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./dist/index.js",
    provides: [{ kind: PluginExecution.kind, id: PluginExecution.id, version: PluginExecution.version }],
    requires: [{ kind: Logger.kind, id: Logger.id, range: "^1.0.0" }], permissions: [], optionalPermissions: [],
  },
  activate(ctx) {
    const logger = ctx.use(Logger);
    ctx.provide(PluginExecution, {
      load(manifest, source, environment, owner, limits) { return isolatedDefinition(manifest, source, environment, owner, ctx.signal, limits); },
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
