import { definePlugin } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { Vault } from "@lunaris/vault";
import { FilesystemSources } from "@lunaris/filesystem";
import { AccountSession, AccountVaults, ServerTransport, validRemoteVault, encodeRemoteReference } from "@lunaris/remote";
import type { RemoteResult, RemoteVault } from "@lunaris/remote";

export default definePlugin({ manifest: { manifestVersion: 1, id: "lunaris.account-session", version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./dist/index.js",
  provides: [AccountSession, AccountVaults].map(t => ({ kind: t.kind, id: t.id, version: t.version })),
  requires: [Logger, Vault, FilesystemSources, ServerTransport].map(t => ({ kind: t.kind, id: t.id, range: `^${t.version}` })), permissions: ["vault.access", "filesystem.access", "account.network"], optionalPermissions: [] }, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal); const transport = ctx.use(ServerTransport); const vaults = ctx.use(Vault);
  const sources = ctx.use(FilesystemSources);
  const cancelled = () => ({ ok: false as const, error: { code: "CANCELLED" as const, message: "The account service stopped." } });
  const incompatible = () => ({ ok: false as const, error: { code: "PROTOCOL_MISMATCH" as const, message: "Invalid server Vault response." } });
  const presented = (vault: RemoteVault): RemoteVault => Object.freeze({ ...vault, location: Object.freeze({ reference: encodeRemoteReference(transport.current()?.server ?? "", vault.location.reference), label: `${transport.current()?.server ?? ""} · ${vault.name}` }) });
  async function releaseRemote(vaultId?: string): Promise<RemoteResult<null>> {
    const root = vaults.current(); if (!root) return { ok: true, value: null };
    const identity = sources.remoteIdentity(root.id);
    if (!identity.ok) return identity.error.code === "UNSUPPORTED" ? { ok: true, value: null } : identity;
    if (vaultId !== undefined && identity.value.vaultId !== vaultId) return { ok: true, value: null };
    return vaults.close();
  }
  async function catalogRequest(method: "GET" | "POST", path: string, body?: unknown): Promise<RemoteResult<unknown>> {
    const state = transport.current(); if (!state) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } };
    const result = await transport.request(method, path, body);
    if (ctx.signal.aborted || transport.current()?.epoch !== state.epoch) return cancelled(); return result;
  }
  ctx.provide(AccountSession, {
    current: () => transport.current(),
    async connect(address, owner) { const closed = await releaseRemote(); if (ctx.signal.aborted) return cancelled(); if (!closed.ok) return closed; return transport.connect(address, owner); },
    register: (login, password, invitation) => transport.register(login, password, invitation),
    async login(login, password) { const closed = await releaseRemote(); if (ctx.signal.aborted) return cancelled(); if (!closed.ok) return closed; return transport.login(login, password); },
    async logout() { const closed = await releaseRemote(); if (ctx.signal.aborted) return cancelled(); if (!closed.ok) return closed; return transport.logout(); },
  });
  ctx.provide(AccountVaults, {
    list: async (state = "active") => { const result = await catalogRequest("GET", `vaults?state=${state}`) as RemoteResult<readonly RemoteVault[]>; if (ctx.signal.aborted) return cancelled(); if (result.ok && (!Array.isArray(result.value) || !result.value.every(validRemoteVault))) return incompatible(); return result.ok ? { ok: true, value: Object.freeze(result.value.map(presented)) } : result; },
    create: async name => { const result = await catalogRequest("POST", "vaults", { name }) as RemoteResult<RemoteVault>; if (ctx.signal.aborted) return cancelled(); if (result.ok) { if (!validRemoteVault(result.value)) return incompatible(); logger.info(ctx.pluginId, "Server Vault created"); return { ok: true, value: presented(result.value) }; } return result; },
    trash: async id => { const closed = await releaseRemote(id); if (ctx.signal.aborted) return cancelled(); if (!closed.ok) return closed; return await catalogRequest("POST", `vaults/${id}/trash`, {}) as RemoteResult<null>; },
    restore: async id => { const result = await catalogRequest("POST", `vaults/${id}/restore`, {}) as RemoteResult<RemoteVault>; if (ctx.signal.aborted) return cancelled(); if (result.ok && !validRemoteVault(result.value)) return incompatible(); return result.ok ? { ok: true, value: presented(result.value) } : result; },
  });
  logger.info(ctx.pluginId, "Account services ready");
} });
