import { PluginLoader } from "@lunaris/execution";
import { Logger } from "@lunaris/logging";
import { capturePackageResources, definePlugin } from "@lunaris/sdk";
import type { PluginDefinition } from "@lunaris/sdk";

async function importPackage(source: string): Promise<{ default?: unknown }> {
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  try { return await import(/* @vite-ignore */ url); }
  finally { URL.revokeObjectURL(url); }
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
    : item);
}

/** Installed modules use the application realm and the same kernel context as built-in modules. */
export function createApplicationExecution(evaluate = importPackage): PluginDefinition {
  return definePlugin({ manifest: {
    manifestVersion: 1, id: "lunaris.application-execution", version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0",
    entry: "./plugin-execution.js",
    provides: [{ kind: PluginLoader.kind, id: PluginLoader.id, version: PluginLoader.version }],
    requires: [{ kind: Logger.kind, id: Logger.id, range: "^1.0.0" }], permissions: [], optionalPermissions: [],
  }, activate(ctx) {
    const logger = ctx.use(Logger);
    ctx.provide(PluginLoader, { load(manifest, source, _environment, owner) {
      if (source.entry !== manifest.entry.slice(2) || !Object.hasOwn(source.modules, source.entry)) throw new Error("Package entry does not match the inspected manifest.");
      const code = source.modules[source.entry]!;
      const identity = canonical(manifest);
      const resources = capturePackageResources(source.resources);
      return definePlugin({ manifest, async activate(plugin) {
        owner.throwIfAborted();
        ctx.signal.throwIfAborted();
        const entry = (await evaluate(code)).default as PluginDefinition | undefined;
        plugin.signal.throwIfAborted();
        owner.throwIfAborted();
        ctx.signal.throwIfAborted();
        if (!entry || typeof entry.activate !== "function" || canonical(definePlugin(entry).manifest) !== identity) {
          throw new Error("Package entry manifest differs from inspected metadata.");
        }
        return entry.activate(Object.freeze({ ...plugin, resources: resources(plugin.signal) }));
      } });
    } });
    logger.info(ctx.pluginId, "Application module loader ready");
  } });
}
