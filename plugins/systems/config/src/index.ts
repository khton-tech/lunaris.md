import { definePlugin } from "@lunaris/sdk";
import { ApplicationDirectory, Filesystem } from "@lunaris/filesystem";
import type { FileTarget } from "@lunaris/filesystem";
import { Vault, PrepareVault } from "@lunaris/vault";
import { Logger, scopeLogger } from "@lunaris/logging";
import { Config, ConfigSnapshots, ConfigChanged, validConfigKey, validPluginId } from "@lunaris/config";
import type { ConfigChange, ConfigReadOptions, ConfigResult, ConfigTable, ConfigTarget, ConfigValue } from "@lunaris/config";
import { ConfigDataError, decode, encode, isTable, merge, snapshot } from "./codec.js";
import { createStorage } from "./storage.js";
import manifest from "../manifest.json" with { type: "json" };

const invalid = (): Extract<ConfigResult<never>, { ok: false }> => ({ ok: false, error: { code: "INVALID_ARGUMENT", message: "A canonical plugin ID, valid key and explicit configuration scope are required." } });

export default definePlugin({ manifest, async activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal);
  logger.debug(ctx.pluginId, "Activating config manager");
  const fs = ctx.use(Filesystem);
  const vaults = ctx.use(Vault);
  const storage = createStorage(fs, () => ctx.signal.aborted);
  async function invoke<T>(operation: string, work: () => Promise<ConfigResult<T>>): Promise<ConfigResult<T>> {
    let result: ConfigResult<T>;
    try { result = await work(); }
    catch (error) {
      if (ctx.signal.aborted) return { ok: false, error: { code: "STOPPED", message: "The config manager is stopped." } };
      logger.error(ctx.pluginId, "Configuration operation failed", { code: error instanceof ConfigDataError ? error.code : "CONFIG_OPERATION_FAILED", error, data: { operation } });
      if (!(error instanceof ConfigDataError)) throw error;
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (!result.ok && !ctx.signal.aborted) logger.error(ctx.pluginId, "Configuration operation declined", { code: result.error.code, error: result.error, data: { operation } });
    return result;
  }
  const opened = await invoke("openGlobal", () => ctx.use(ApplicationDirectory).openConfig(ctx.signal));
  ctx.signal.throwIfAborted();
  if (!opened.ok) throw new Error(`Cannot open global configuration: ${opened.error.code}`);
  const global: FileTarget = Object.freeze({ vaultId: opened.value.id, path: "config.toml" });
  const initialized = await invoke("initializeGlobal", () => storage.ensure(global));
  ctx.signal.throwIfAborted();
  if (!initialized.ok) throw new Error(`Cannot initialize global configuration: ${initialized.error.code}`);

  ctx.hooks.register(PrepareVault, async preparation => {
    if (preparation.error !== null) return preparation;
    const ready = await invoke("prepareVault", () => storage.prepareVault(preparation.vault.id));
    if (!ready.ok) return { ...preparation, error: `Cannot prepare Vault configuration: ${ready.error.code}` };
    if (!ctx.signal.aborted) logger.info(ctx.pluginId, "Vault configuration ready", { data: { vaultId: preparation.vault.id } });
    return preparation;
  }, { priority: -100 });
  const current = vaults.current();
  if (current) {
    const ready = await invoke("prepareCurrentVault", () => storage.prepareVault(current.id));
    ctx.signal.throwIfAborted();
    if (!ready.ok) throw new Error(`Cannot initialize current Vault configuration: ${ready.error.code}`);
  }

  function resolve(options: ConfigReadOptions | undefined, writing = false): ConfigResult<{ scope: "global" | "vault" | "effective"; vault: FileTarget | null }> {
    const scope = options?.scope ?? (writing ? undefined : "effective");
    if (!scope || !["global", "vault", "effective"].includes(scope) || (writing && scope === "effective") ||
      (options !== undefined && (options === null || typeof options !== "object" || Object.keys(options).some(key => !["scope", "vaultId"].includes(key))))) return invalid();
    const id = options && "vaultId" in options ? options.vaultId : undefined;
    if ((id !== undefined && (typeof id !== "string" || id.length === 0)) || (scope === "global" && id !== undefined)) return invalid();
    const vaultId = scope === "global" ? undefined : id ?? vaults.current()?.id;
    if (scope === "vault" && !vaultId) return { ok: false, error: { code: "NO_VAULT", message: "No Vault is active; supply an explicit Vault ID or use global scope." } };
    return { ok: true, value: { scope, vault: vaultId ? Object.freeze({ vaultId, path: ".lunaris/config.toml" }) : null } };
  }
  async function read(pluginId: string, options?: ConfigReadOptions): Promise<ConfigResult<ConfigTable>> {
    if (!validPluginId(pluginId)) return invalid();
    const resolved = resolve(options);
    if (!resolved.ok) return resolved;
    const { scope, vault } = resolved.value;
    if (scope === "global") return storage.read(global, pluginId);
    if (scope === "vault") return storage.read(vault!, pluginId);
    // Resolve both explicit file targets before yielding; switching cannot retarget this read.
    const [base, local] = await Promise.all([
      storage.read(global, pluginId),
      vault ? storage.read(vault, pluginId) : Promise.resolve({ ok: true, value: {} } as const),
    ]);
    if (!base.ok) return base;
    if (!local.ok) return local;
    return { ok: true, value: merge(base.value, local.value) };
  }
  function publish(change: ConfigChange): void {
    if (ctx.signal.aborted) return;
    logger.info(ctx.pluginId, "Configuration saved", { data: change });
    void ctx.events.emit(ConfigChanged, Object.freeze(change)).catch(error => {
      if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot publish configuration change", { code: "CONFIG_EVENT_FAILED", error });
    });
  }
  async function mutate(pluginId: string, key: string, value: ConfigValue | undefined, target: ConfigTarget): Promise<ConfigResult<boolean>> {
    if (!validPluginId(pluginId) || !validConfigKey(key)) return invalid();
    const resolved = resolve(target, true);
    if (!resolved.ok) return resolved;
    const { scope, vault } = resolved.value;
    const copy = value === undefined ? undefined : snapshot(value);
    const result = await storage.mutate(scope === "global" ? global : vault!, pluginId, key, copy);
    if (result.ok && result.value) publish({ pluginId, key, scope: scope === "global" ? "global" : "vault", vaultId: vault?.vaultId ?? null, kind: value === undefined ? "removed" : "set" });
    return result;
  }
  ctx.provide(Config, {
    read: (pluginId, options) => invoke("read", () => read(pluginId, options)),
    get: (pluginId, key, options) => invoke("get", async () => {
      if (!validConfigKey(key)) return invalid();
      const result = await read(pluginId, options);
      return result.ok ? { ok: true, value: Object.hasOwn(result.value, key) ? result.value[key] : undefined } : result;
    }),
    set: (pluginId, key, value, target) => invoke("set", async () => {
      if (value === undefined) return { ok: false, error: { code: "INVALID_VALUE", message: "Use remove to delete a configuration key." } };
      const result = await mutate(pluginId, key, value, target);
      return result.ok ? { ok: true, value: null } : result;
    }),
    remove: (pluginId, key, target) => invoke("remove", () => mutate(pluginId, key, undefined, target)),
  });
  ctx.provide(ConfigSnapshots, {
    capture: (pluginId, target) => invoke('captureNamespace', async () => {
      if (!validPluginId(pluginId)) return invalid();
      const resolved = resolve(target, true); if (!resolved.ok) return resolved;
      const current = await storage.read(resolved.value.scope === 'global' ? global : resolved.value.vault!, pluginId);
      if (!current.ok) return current;
      const text = encode({ formatVersion: 1, values: current.value });
      if (text.length > 256 * 1024) return { ok: false, error: { code: 'TOO_LARGE', message: 'Configuration namespace snapshot exceeds 256 KiB.' } };
      return { ok: true, value: text };
    }),
    restore: (pluginId, text, target) => invoke('restoreNamespace', async () => {
      if (!validPluginId(pluginId) || typeof text !== 'string' || text.length > 256 * 1024) return invalid();
      const resolved = resolve(target, true); if (!resolved.ok) return resolved;
      const document = decode(text);
      if (Object.keys(document).length !== 2 || document.formatVersion !== 1 || !isTable(document.values)) return { ok: false, error: { code: 'INVALID_CONFIG', message: 'A version 1 namespace snapshot and values table are required.' } };
      const values = snapshot(document.values) as ConfigTable;
      const { scope, vault } = resolved.value;
      const result = await storage.replace(scope === 'global' ? global : vault!, pluginId, values);
      if (!result.ok) return result;
      for (const key of result.value) publish({ pluginId, key, scope: scope === 'global' ? 'global' : 'vault', vaultId: vault?.vaultId ?? null, kind: Object.hasOwn(values, key) ? 'set' : 'removed' });
      logger.info(ctx.pluginId, 'Configuration namespace restored', { data: { pluginId, keyCount: result.value.length, scope } });
      return { ok: true, value: null };
    }),
  });
  logger.info(ctx.pluginId, "Config manager ready", { code: "CONFIG_READY" });
} });
