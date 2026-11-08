import { definePlugin } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { ServerTransport, AccountSessionChanged, validRemoteVault } from "@lunaris/remote";
import type { RemoteVault } from "@lunaris/remote";
import { RemoteFilesystemBackend, failure, validTarget, validFolderLocation } from "@lunaris/filesystem";
import type { FsResult, FsCapabilities, FileTarget, RemoteRootIdentity } from "@lunaris/filesystem";
import { validFileResponse } from "./protocol.js";

interface Root { readonly identity: RemoteRootIdentity; readonly epoch: string; readonly detach: () => void }
interface Watch { readonly rootId: string; readonly detach: () => void }
export default definePlugin({ manifest: { manifestVersion: 1, id: "lunaris.remote-filesystem", version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./dist/index.js",
  provides: [RemoteFilesystemBackend.api, RemoteFilesystemBackend.changed].map(t => ({ kind: t.kind, id: t.id, version: t.version })),
  requires: [Logger, ServerTransport, AccountSessionChanged].map(t => ({ kind: t.kind, id: t.id, range: `^${t.version}` })),
  permissions: ["account.network", "account.access", "filesystem.native"], optionalPermissions: [] }, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal); const transport = ctx.use(ServerTransport);
  const roots = new Map<string, Root>(); const watches = new Map<string, Watch>(); const cursors = new Map<string, string>();
  let sequence = 0; let polling = false;
  const next = () => `${ctx.activationId}:${++sequence}`;
  const unsupported = () => Promise.resolve(failure("UNSUPPORTED", "Use the server Vault catalog and file explorer."));
  const capabilities: FsCapabilities = Object.freeze({ watch: true, atomicReplace: true, versionCheck: "optimistic", trash: false, maxFileBytes: Number.MAX_SAFE_INTEGER });
  function unwatch(id: string) { watches.get(id)?.detach(); watches.delete(id); }
  function close(id: string) { for (const [watchId, watch] of watches) if (watch.rootId === id) unwatch(watchId); roots.get(id)?.detach(); roots.delete(id); cursors.delete(id); }
  function live(id: string): FsResult<Root> {
    const root = roots.get(id); if (!root) return failure("VAULT_CLOSED", "The server Vault attachment is closed.");
    const state = transport.current();
    return state?.epoch === root.epoch ? { ok: true, value: root } : failure("SESSION_EXPIRED", "Sign in again to access this Vault.");
  }
  ctx.events.on(AccountSessionChanged, () => { for (const id of watches.keys()) unwatch(id); cursors.clear(); });
  async function describe(reference: string): Promise<FsResult<RemoteVault>> {
    const state = transport.current(); if (!state) return failure("UNAUTHENTICATED", "Sign in to continue.");
    const parts = reference.split('/');
    if (parts.length !== 2 || parts[0] !== state.account.id || !/^[a-f0-9-]{36}$/.test(parts[1]!)) return failure("NOT_FOUND", "The location belongs to another account.");
    const result = await transport.request("GET", "vaults"); if (!result.ok) return result as FsResult<never>;
    if (ctx.signal.aborted || transport.current()?.epoch !== state.epoch) return failure("CANCELLED", "The account session changed.");
    if (!Array.isArray(result.value) || !result.value.every(validRemoteVault)) return failure("PROTOCOL_MISMATCH", "Invalid Vault catalog.");
    const vault = (result.value as RemoteVault[]).find(vault => vault.id === parts[1] && vault.location?.reference === reference);
    return vault ? { ok: true, value: vault } : failure("NOT_FOUND", "Vault not found.");
  }
  async function file<T>(target: FileTarget, operation: string, args: object = {}): Promise<FsResult<T>> {
    if (!validTarget(target, true)) return failure("INVALID_PATH", "A Vault-relative target is required.");
    const root = live(target.vaultId); if (!root.ok) return root;
    const result = await transport.request("POST", `vaults/${root.value.identity.vaultId}/files`, { operation, args: { path: target.path, ...args } });
    if (ctx.signal.aborted || !roots.has(target.vaultId)) return failure("CANCELLED", "The Vault attachment closed.");
    if (result.ok && !validFileResponse(operation, result.value)) return failure("PROTOCOL_MISMATCH", "The server returned an invalid filesystem response.");
    return result as FsResult<T>;
  }
  async function watch(target: FileTarget, owner: CancellationSignal): Promise<FsResult<string>> {
    if (owner.aborted || ctx.signal.aborted) return failure("CANCELLED", "Observation cancelled.");
    if (!validTarget(target, true)) return failure("INVALID_PATH", "A Vault-relative target is required.");
    const root = live(target.vaultId); if (!root.ok) return root;
    const id = next(); const abort = () => unwatch(id);
    watches.set(id, { rootId: target.vaultId, detach: () => owner.removeEventListener("abort", abort) }); owner.addEventListener("abort", abort, { once: true });
    return { ok: true, value: id };
  }
  const timer = setInterval(() => {
    if (polling || ctx.signal.aborted || !watches.size) return; polling = true;
    void (async () => {
      for (const rootId of new Set([...watches.values()].map(w => w.rootId))) {
        if (ctx.signal.aborted) return;
        const root = live(rootId); if (!root.ok) continue;
        const result = await transport.request("POST", `vaults/${root.value.identity.vaultId}/changes`, { cursor: cursors.get(rootId) });
        if (ctx.signal.aborted || !roots.has(rootId) || !result.ok) continue;
        const value = result.value as { cursor: string; rescan: boolean };
        if (typeof value?.cursor !== "string") continue;
        cursors.set(rootId, value.cursor);
        if (value.rescan) for (const [watchId, registration] of watches) if (registration.rootId === rootId && !ctx.signal.aborted) {
          await ctx.events.emit(RemoteFilesystemBackend.changed, { vaultId: rootId, watchId, kind: "rescan", paths: [] });
        }
      }
    })().catch(error => { if (!ctx.signal.aborted) logger.warn(ctx.pluginId, "Server observation interrupted", { error }); }).finally(() => { polling = false; });
  }, 1500);
  ctx.scope.own({ dispose() { clearInterval(timer); for (const id of roots.keys()) close(id); } });
  ctx.provide(RemoteFilesystemBackend.api, {
    capabilities: () => capabilities,
    remoteIdentity: id => { const root = roots.get(id); return root ? { ok: true, value: root.identity } : failure("VAULT_CLOSED", "Attachment closed."); },
    openConfig: unsupported, selectOwned: unsupported, selectVault: unsupported, selectLocation: unsupported, createLocation: unsupported,
    pickFile: unsupported, pickDirectory: unsupported, pickSaveLocation: unsupported,
    async describeLocation(reference) { const result = await describe(reference); if (ctx.signal.aborted) return failure("CANCELLED", "The driver stopped."); return result.ok ? { ok: true, value: { ...result.value.location, label: `${transport.current()?.server ?? ""} · ${result.value.name}` } } : result; },
    async attachLocation(location, owner) {
      if (!validFolderLocation(location)) return failure("INVALID_ARGUMENT", "A server Vault location is required.");
      if (owner.aborted) return failure("CANCELLED", "Attachment cancelled.");
      const state = transport.current(); const result = await describe(location.reference);
      if (owner.aborted || ctx.signal.aborted || !state || transport.current()?.epoch !== state.epoch) return failure("CANCELLED", "Attachment cancelled.");
      if (!result.ok) return result;
      const id = next(); const abort = () => close(id);
      roots.set(id, { epoch: state.epoch, identity: Object.freeze({ server: state.server, accountId: state.account.id, vaultId: result.value.id }), detach: () => owner.removeEventListener("abort", abort) });
      owner.addEventListener("abort", abort, { once: true }); logger.info(ctx.pluginId, "Server Vault attached"); return { ok: true, value: { id, name: result.value.name } };
    },
    async closeVault(id) { if (!roots.has(id)) return failure("VAULT_CLOSED", "Attachment closed."); close(id); logger.info(ctx.pluginId, "Server Vault released"); return { ok: true, value: null }; },
    readText: target => file(target, "readText"), readFile: target => file(target, "readFile"),
    stat: target => file(target, "stat"), list: target => file(target, "list"),
    writeText: (target, text, options) => file(target, "writeText", { text, options }),
    writeFile: (target, data, options) => file(target, "writeFile", { data, options }),
    createDirectory: (target, recursive = false) => file(target, "createDirectory", { recursive }),
    remove: (target, recursive = false) => file(target, "remove", { recursive }),
    move: (source, destination, overwrite = false) => source.vaultId !== destination.vaultId ? Promise.resolve(failure("INVALID_PATH", "Transfers must stay within one Vault.")) : file(source, "move", { destination: destination.path, overwrite }),
    copy: (source, destination, overwrite = false) => source.vaultId !== destination.vaultId ? Promise.resolve(failure("INVALID_PATH", "Transfers must stay within one Vault.")) : file(source, "copy", { destination: destination.path, overwrite }),
    watchOwned: watch, watch: target => watch(target, ctx.signal),
    async unwatch(rootId, id) { const registration = watches.get(id); if (registration && registration.rootId !== rootId) return failure("INVALID_ARGUMENT", "Observation belongs to another attachment."); unwatch(id); return { ok: true, value: null }; },
  });
  logger.info(ctx.pluginId, "Remote filesystem driver ready");
} });
