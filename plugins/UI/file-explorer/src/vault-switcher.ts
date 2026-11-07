import type { PluginContext } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { Vault, VaultChanged, VaultHistory, VaultHistoryChanged } from "@lunaris/vault";
import type { RecentVault, VaultHistoryResult } from "@lunaris/vault";

/** Workspace navigation state is independent of file-tree sessions. */
export function createVaultSwitcher(ctx: PluginContext, changed: () => void) {
  const vaults = ctx.use(Vault); const history = ctx.use(VaultHistory); const logger = ctx.use(Logger);
  let entries: readonly RecentVault[] = []; let version = 0; let busy = false;
  let error = ""; let historyError = false; let activeReference: string | null = null;
  async function load(): Promise<void> {
    const requested = ++version;
    try {
      const result = await history.list();
      if (ctx.signal.aborted || requested !== version) return;
      historyError = !result.ok;
      if (result.ok) entries = result.value;
      else logger.warn(ctx.pluginId, "Vault switcher history unavailable", { code: result.error.code, error: result.error });
    } catch (cause) {
      if (ctx.signal.aborted || requested !== version) return;
      historyError = true; logger.error(ctx.pluginId, "Cannot load Vault switcher history", { error: cause });
    }
    changed();
  }
  async function run(work: () => Promise<VaultHistoryResult<unknown>>): Promise<void> {
    if (busy || ctx.signal.aborted) return;
    busy = true; error = ""; changed();
    try {
      const result = await work();
      if (ctx.signal.aborted) return;
      if ((!result.ok && result.error.code === "CANCELLED") || (result.ok && result.value === null)) return;
      if (!result.ok) {
        error = "switchFailed";
        logger.warn(ctx.pluginId, "Cannot switch Vault", { code: result.error.code, error: result.error });
      } else logger.info(ctx.pluginId, "Vault switch request completed");
    } catch (cause) {
      if (ctx.signal.aborted) return;
      error = "switchFailed"; logger.error(ctx.pluginId, "Vault switch failed", { error: cause });
    } finally { busy = false; if (!ctx.signal.aborted) changed(); }
  }
  ctx.events.on(VaultChanged, change => {
    if (vaults.current()?.id !== change.current?.id) return;
    activeReference = change.location?.reference ?? null; error = ""; changed();
  });
  ctx.events.on(VaultHistoryChanged, change => { version++; entries = change.entries; historyError = false; changed(); });
  void load();
  return {
    snapshot() {
      return { name: vaults.current()?.name ?? "", entries: entries.slice(0, 4).map(entry => ({ reference: entry.location.reference, name: entry.name, label: entry.location.label })),
        activeReference, busy, error, historyError,
        onRecent(reference: string) {
          if (!entries.slice(0, 4).some(entry => entry.location.reference === reference) || reference === activeReference) return;
          void run(() => history.open(reference));
        },
        onChange() { void run(() => vaults.open()); },
        onRetry() { if (!busy && !ctx.signal.aborted) void load(); },
      };
    },
  };
}
