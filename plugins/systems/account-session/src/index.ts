import { definePlugin } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { Vault } from "@lunaris/vault";
import { AccountSession, AccountVaults, ServerTransport } from "@lunaris/remote";
import type { RemoteResult, RemoteVault } from "@lunaris/remote";

export default definePlugin({ manifest: { manifestVersion: 1, id: "lunaris.account-session", version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./dist/index.js",
  provides: [AccountSession, AccountVaults].map(t => ({ kind: t.kind, id: t.id, version: t.version })),
  requires: [Logger, Vault, ServerTransport].map(t => ({ kind: t.kind, id: t.id, range: `^${t.version}` })), permissions: ["vault.access", "account.network"], optionalPermissions: [] }, activate(ctx) {
  const logger = ctx.use(Logger); const transport = ctx.use(ServerTransport); const vaults = ctx.use(Vault);
  ctx.provide(AccountSession, {
    current: () => transport.current(),
    async connect(address, owner) { const closed = await vaults.close(); if (!closed.ok) return closed; return transport.connect(address, owner); },
    register: (login, password, invitation) => transport.register(login, password, invitation),
    async login(login, password) { const closed = await vaults.close(); if (!closed.ok) return closed; return transport.login(login, password); },
    async logout() { const closed = await vaults.close(); if (!closed.ok) return closed; return transport.logout(); },
  });
  ctx.provide(AccountVaults, {
    list: async (state = "active") => await transport.request("GET", `vaults?state=${state}`) as RemoteResult<readonly RemoteVault[]>,
    create: async name => { const result = await transport.request("POST", "vaults", { name }); if (result.ok) logger.info(ctx.pluginId, "Server Vault created"); return result as RemoteResult<RemoteVault>; },
    trash: async id => { const closed = await vaults.close(); if (!closed.ok) return closed; return await transport.request("POST", `vaults/${id}/trash`, {}) as RemoteResult<null>; },
    restore: async id => await transport.request("POST", `vaults/${id}/restore`, {}) as RemoteResult<RemoteVault>,
  });
  logger.info(ctx.pluginId, "Account services ready");
} });
