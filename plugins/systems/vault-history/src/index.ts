import { definePlugin } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { Config } from "@lunaris/config";
import { VaultLocations, VaultChanged, VaultHistory, VaultHistoryChanged, validRecentVault } from "@lunaris/vault";
import type { RecentVault, VaultHistoryResult } from "@lunaris/vault";
import manifest from "../manifest.json" with { type: "json" };

const limit = 20;
const unavailable = (): VaultHistoryResult<never> => ({ ok: false, error: { code: "HISTORY_UNAVAILABLE", message: "Recent Vault history is unavailable." } });
function snapshot(entries: readonly RecentVault[]): readonly RecentVault[] {
  return Object.freeze(entries.map(entry => Object.freeze({ name: entry.name, location: Object.freeze({ ...entry.location }) })));
}

export default definePlugin({ manifest, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal);
  const config = ctx.use(Config);
  const locations = ctx.use(VaultLocations);
  let queue: Promise<unknown> = Promise.resolve();
  async function read(): Promise<VaultHistoryResult<readonly RecentVault[]>> {
    if (ctx.signal.aborted) return { ok: false, error: { code: "STOPPED", message: "The history provider is stopped." } };
    const result = await config.get(ctx.pluginId, "entries", { scope: "global" });
    if (ctx.signal.aborted) return { ok: false, error: { code: "STOPPED", message: "The history provider is stopped." } };
    if (!result.ok) {
      logger.warn(ctx.pluginId, "Cannot read recent Vault history", { code: result.error.code, error: result.error });
      return unavailable();
    }
    const entries = result.value ?? [];
    if (!Array.isArray(entries) || !entries.every(validRecentVault)) {
      logger.warn(ctx.pluginId, "Recent Vault history contains invalid entries", { code: "INVALID_HISTORY" });
      return unavailable();
    }
    const unique = new Map<string, RecentVault>();
    for (const entry of entries as unknown as readonly RecentVault[]) {
      if (!unique.has(entry.location.reference)) unique.set(entry.location.reference, entry);
    }
    return { ok: true, value: snapshot([...unique.values()].slice(0, limit)) };
  }
  async function record(entry: RecentVault): Promise<void> {
    if (ctx.signal.aborted) return;
    const described = await locations.describe(entry.location.reference);
    if (ctx.signal.aborted) return;
    if (described.ok) entry = { name: entry.name, location: described.value };
    else logger.warn(ctx.pluginId, "Cannot refresh recorded Vault location; retaining saved label", { code: described.error.code, error: described.error });
    const previous = await read();
    if (!previous.ok || ctx.signal.aborted) return;
    const entries = snapshot([entry, ...previous.value.filter(item => item.location.reference !== entry.location.reference)].slice(0, limit));
    const saved = await config.set(ctx.pluginId, "entries", entries.map(item => ({ name: item.name, location: { ...item.location } })), { scope: "global" });
    if (ctx.signal.aborted) return;
    if (!saved.ok) {
      logger.warn(ctx.pluginId, "Cannot persist recent Vault history; active Vault remains usable", { code: saved.error.code, error: saved.error });
      return;
    }
    logger.info(ctx.pluginId, "Recent Vault history saved", { data: { count: entries.length } });
    void ctx.events.emit(VaultHistoryChanged, Object.freeze({ entries })).catch(error => {
      if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot publish recent Vault history", { code: "HISTORY_EVENT_FAILED", error });
    });
  }
  ctx.events.on(VaultChanged, change => {
    if (!change.current || !change.location) return;
    const entry = snapshot([{ name: change.current.name, location: change.location }])[0]!;
    queue = queue.then(() => record(entry)).catch(error => {
      if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot update recent Vault history", { code: "HISTORY_UPDATE_FAILED", error });
    });
    // Do not await observers from the serialized queue: they may call list/open.
  });
  ctx.provide(VaultHistory, {
    async list() {
      await queue;
      const result = await read();
      if (!result.ok) return result;
      const entries: RecentVault[] = [];
      for (const entry of result.value) {
        if (ctx.signal.aborted) return { ok: false, error: { code: "STOPPED", message: "The history provider is stopped." } };
        const described = await locations.describe(entry.location.reference);
        if (ctx.signal.aborted) return { ok: false, error: { code: "STOPPED", message: "The history provider is stopped." } };
        if (!described.ok) logger.warn(ctx.pluginId, "Cannot refresh recent Vault location; retaining saved label", { code: described.error.code, error: described.error });
        entries.push({ name: entry.name, location: described.ok ? described.value : entry.location });
      }
      return { ok: true, value: snapshot(entries) };
    },
    async open(reference) {
      if (typeof reference !== "string" || reference.length === 0) return { ok: false, error: { code: "INVALID_ARGUMENT", message: "A recent location reference is required." } };
      await queue;
      const history = await read();
      if (!history.ok) return history;
      const entry = history.value.find(item => item.location.reference === reference);
      if (!entry) return { ok: false, error: { code: "NOT_FOUND", message: "The recent Vault entry does not exist." } };
      // Restore current persisted Vault metadata; history names are only presentation.
      return locations.open(entry.location);
    },
  });
  logger.info(ctx.pluginId, "Recent Vault history provider ready", { code: "VAULT_HISTORY_READY" });
} });
