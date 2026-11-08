import { definePlugin } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { ClientUpdates, ClientUpdateChanged, ServerTransport, AccountSessionChanged } from "@lunaris/remote";
import type { RemoteResult } from "@lunaris/remote";

export function createClientUpdates(currentBuild: string) {
  return definePlugin({ manifest: { manifestVersion: 1, id: "lunaris.client-updates", version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./dist/index.js",
    provides: [ClientUpdates, ClientUpdateChanged].map(t => ({ kind: t.kind, id: t.id, version: t.version })),
    requires: [Logger, ServerTransport, AccountSessionChanged].map(t => ({ kind: t.kind, id: t.id, range: `^${t.version}` })), permissions: ["account.network", "account.access"], optionalPermissions: [] }, activate(ctx) {
    const logger = ctx.use(Logger); const transport = ctx.use(ServerTransport); let available: string | null = null;
    let pending: Promise<RemoteResult<string | null>> | undefined;
    function check(): Promise<RemoteResult<string | null>> {
      if (pending) return pending;
      pending = (async () => {
        const result = await transport.request("GET", "server"); if (!result.ok) return result;
        if (ctx.signal.aborted) return { ok: false as const, error: { code: "CANCELLED" as const, message: "Update check cancelled." } };
        const build = (result.value as { buildId?: unknown } | null)?.buildId;
        const next = typeof build === "string" && /^[a-f0-9-]{36}$/.test(build) && build !== currentBuild ? build : null;
        if (available !== next) { available = next; await ctx.events.emit(ClientUpdateChanged, { buildId: available }); if (!ctx.signal.aborted) logger.info(ctx.pluginId, "Browser update availability changed"); }
        return { ok: true as const, value: available };
      })().finally(() => { pending = undefined; }); return pending;
    }
    const poll = () => { if (!ctx.signal.aborted) void check().catch(error => { if (!ctx.signal.aborted) logger.warn(ctx.pluginId, "Update check failed", { error }); }); };
    const timer = setInterval(poll, 60000); ctx.scope.own({ dispose() { clearInterval(timer); } });
    ctx.events.on(AccountSessionChanged, poll); ctx.provide(ClientUpdates, { available: () => available, check });
    logger.info(ctx.pluginId, "Client update service ready");
  } });
}
