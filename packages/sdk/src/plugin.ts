import { validateManifest } from "@lunaris/manifest";
import type { PluginManifest } from "@lunaris/manifest";
import type { Disposable, MaybePromise, PluginContext } from "./context.js";
import { readDataObject } from "./data.js";
import { LunarisError } from "./errors.js";
import { rememberManifest } from "./tokens.js";

export interface PluginDefinition {
  readonly manifest: PluginManifest;
  readonly activate: (context: PluginContext) => MaybePromise<void | Disposable>;
}

/** Author input can come directly from JSON; the factory validates it at runtime. */
export interface PluginInput {
  readonly manifest: unknown;
  readonly activate: PluginDefinition["activate"];
}

/** Validate/copy metadata without executing activation or coupling SDK to a runtime. */
export function definePlugin(definition: PluginInput): PluginDefinition {
  const data = readDataObject(definition, ["manifest", "activate"], "MANIFEST_INVALID");
  const result = validateManifest(data.manifest);
  if (!result.ok) {
    const first = result.diagnostics[0];
    throw new LunarisError("MANIFEST_INVALID", "Invalid plugin manifest.",
      { ...(first?.pluginId ? { pluginId: first.pluginId } : {}), ...(first ? { path: first.path } : {}) },
      { cause: result.diagnostics });
  }
  if (typeof data.activate !== "function") {
    throw new LunarisError("MANIFEST_INVALID", "Plugin activation must be a function.", { pluginId: result.manifest.id, path: "$.activate" });
  }
  rememberManifest(result.manifest);
  return Object.freeze({ manifest: result.manifest, activate: data.activate as PluginDefinition["activate"] });
}
