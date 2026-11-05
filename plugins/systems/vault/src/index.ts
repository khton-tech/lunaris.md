import { definePlugin } from "@lunaris/sdk";
import type { ResourceScope } from "@lunaris/sdk";
import { Filesystem, FilesystemRoots, FilesystemLocations, validFolderLocation } from "@lunaris/filesystem";
import type { FolderLocation, VaultRoot } from "@lunaris/filesystem";
import { Vault, VaultLocations, VaultChanged, PrepareVault, validVaultName } from "@lunaris/vault";
import type { VaultChange, VaultResult } from "@lunaris/vault";
import { Logger } from "@lunaris/logging";
import manifest from "../manifest.json" with { type: "json" };

interface Attachment { readonly vault: VaultRoot; readonly scope: ResourceScope }
const failed = (code: "BUSY" | "PREPARATION_FAILED" | "STOPPED", message: string): VaultResult<never> => ({ ok: false, error: { code, message } });

export default definePlugin({ manifest, activate(ctx) {
  const logger = ctx.use(Logger);
  logger.debug(ctx.pluginId, "Activating Vault Manager");
  const fs = ctx.use(Filesystem);
  const roots = ctx.use(FilesystemRoots);
  const locations = ctx.use(FilesystemLocations);
  let active: Attachment | null = null;
  let busy = false;
  ctx.scope.own({ dispose() { active = null; } });

  function changed(change: VaultChange): void {
    logger.info(ctx.pluginId, "Active Vault changed", { code: "VAULT_CHANGED", data: { kind: change.kind, previousId: change.previous?.id, currentId: change.current?.id } });
    // Notifications do not hold a transition open; listeners may request another transition.
    void ctx.events.emit(VaultChanged, Object.freeze(change)).catch(error => {
      if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot publish Vault change", { code: "VAULT_EVENT_FAILED", error });
    });
  }
  async function transition<T>(operation: string, work: () => Promise<VaultResult<T>>): Promise<VaultResult<T>> {
    if (busy) {
      logger.debug(ctx.pluginId, "Vault transition already in progress", { data: { operation } });
      return failed("BUSY", "Another Vault transition is in progress.");
    }
    busy = true;
    try {
      return await work();
    } catch (error) {
      if (ctx.signal.aborted) return failed("STOPPED", "The Vault Manager is stopped.");
      logger.error(ctx.pluginId, "Unexpected Vault transition failure", { code: "VAULT_TRANSITION_FAILED", error, data: { operation } });
      throw error;
    } finally { busy = false; }
  }
  async function discard(candidate: Attachment): Promise<void> {
    try {
      if (!ctx.signal.aborted) {
        const closed = await fs.closeVault(candidate.vault.id);
        if (!closed.ok && closed.error.code !== "VAULT_CLOSED" && !ctx.signal.aborted) {
          logger.warn(ctx.pluginId, "Candidate release failed; owner cancellation will retry", { code: closed.error.code, error: closed.error, data: { vaultId: candidate.vault.id } });
        }
      }
    } finally { await candidate.scope.dispose(); }
  }

  async function open(location?: FolderLocation, name?: string): Promise<VaultResult<VaultRoot | null>> {
    let change: VaultChange | undefined;
    const result = await transition<VaultRoot | null>("open", async () => {
      const scope = ctx.scope.child();
      let candidate: Attachment | null = null;
      let committed = false;
      try {
        const selected = location ? await locations.attach(location, scope.signal) : await roots.selectVault(scope.signal);
        if (ctx.signal.aborted) return failed("STOPPED", "The Vault Manager is stopped.");
        if (!selected.ok || selected.value === null) {
          if (selected.ok) logger.debug(ctx.pluginId, "Vault selection cancelled");
          return selected;
        }
        candidate = { vault: Object.freeze({ ...selected.value }), scope };
        try {
          const prepared = await ctx.hooks.run(PrepareVault, Object.freeze({ vault: candidate.vault, error: null, ...(name === undefined ? {} : { requestedName: name }) }));
          if (ctx.signal.aborted) return failed("STOPPED", "The Vault Manager is stopped.");
          if (prepared.error !== null || prepared.vault.id !== candidate.vault.id || prepared.vault.name !== candidate.vault.name) {
            const message = prepared.error ?? "Vault preparation changed the selected identity.";
            logger.error(ctx.pluginId, "Vault preparation declined", { code: "PREPARATION_FAILED", error: prepared.error, data: { vaultId: candidate.vault.id } });
            return failed("PREPARATION_FAILED", message);
          }
          if (name !== undefined && prepared.displayName !== name) {
            return failed("PREPARATION_FAILED", "No metadata provider persisted the requested Vault name.");
          }
          if (prepared.displayName !== undefined) candidate = { ...candidate, vault: Object.freeze({ ...candidate.vault, name: prepared.displayName }) };
        } catch (error) {
          if (ctx.signal.aborted) return failed("STOPPED", "The Vault Manager is stopped.");
          logger.error(ctx.pluginId, "Vault preparation failed", { code: "PREPARATION_FAILED", error, data: { vaultId: candidate.vault.id } });
          return failed("PREPARATION_FAILED", "Vault preparation failed.");
        }
        const previous = active;
        if (previous) {
          const closed = await fs.closeVault(previous.vault.id);
          if (ctx.signal.aborted) return failed("STOPPED", "The Vault Manager is stopped.");
          if (!closed.ok && closed.error.code !== "VAULT_CLOSED") return closed;
          await previous.scope.dispose();
        }
        if (ctx.signal.aborted) return failed("STOPPED", "The Vault Manager is stopped.");
        active = candidate;
        committed = true;
        change = { kind: previous ? "switched" : "opened", previous: previous?.vault ?? null, current: candidate.vault, ...(location ? { location } : {}) };
        return { ok: true, value: candidate.vault };
      } finally {
        if (!committed) {
          if (candidate) await discard(candidate);
          else await scope.dispose();
        }
      }
    });
    // The transition lock is released before invoking event listeners.
    if (change && !ctx.signal.aborted) changed(change);
    return result;
  }
  ctx.provide(VaultLocations, {
    async select(owner) {
      return transition("selectLocation", async () => {
        const result = await locations.select(owner);
        return ctx.signal.aborted ? failed("STOPPED", "The Vault Manager is stopped.") : result;
      });
    },
    async open(location, options) {
      if (!validFolderLocation(location) || (options !== undefined && (options === null || typeof options !== "object" ||
        Object.keys(options).some(key => key !== "name") || (options.name !== undefined && !validVaultName(options.name))))) {
        return { ok: false, error: { code: "INVALID_ARGUMENT", message: "A valid location and optional display name are required." } };
      }
      const result = await open(Object.freeze({ reference: location.reference, label: location.label }), options?.name);
      if (!result.ok) return result;
      return result.value === null ? failed("PREPARATION_FAILED", "The selected location could not be attached.") : { ok: true, value: result.value };
    },
  });
  ctx.provide(Vault, {
    current: () => active?.vault ?? null,
    open: () => open(),
    close: async () => {
      let change: VaultChange | undefined;
      const result = await transition<null>("close", async () => {
        if (!active) return { ok: true, value: null };
        const previous = active;
        const result = await fs.closeVault(previous.vault.id);
        if (ctx.signal.aborted) return failed("STOPPED", "The Vault Manager is stopped.");
        if (!result.ok && result.error.code !== "VAULT_CLOSED") return result;
        active = null;
        await previous.scope.dispose();
        change = { kind: "closed", previous: previous.vault, current: null };
        return { ok: true, value: null };
      });
      if (change && !ctx.signal.aborted) changed(change);
      return result;
    },
  });
  logger.info(ctx.pluginId, "Vault Manager ready", { code: "VAULT_READY" });
} });
