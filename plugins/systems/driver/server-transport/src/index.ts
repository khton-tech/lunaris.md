import { definePlugin } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { ServerTransport, REMOTE_PROTOCOL, AccountSessionChanged, ConnectionChanged } from "@lunaris/remote";
import type { AccountState, Account, RemoteResult, ServerInfo } from "@lunaris/remote";

export function createServerTransport(options: { readonly mode: "browser" | "desktop"; readonly fetch?: typeof fetch }) {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  return definePlugin({ manifest: { manifestVersion: 1, id: "lunaris.server-transport", version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./dist/index.js",
    provides: [ServerTransport, AccountSessionChanged, ConnectionChanged].map(t => ({ kind: t.kind, id: t.id, version: t.version })),
    requires: [{ kind: "api", id: Logger.id, range: "^1.0.0" }], permissions: [], optionalPermissions: [] }, activate(ctx) {
    const logger = ctx.use(Logger); let address = ""; let bearer: string | undefined; let current: AccountState | null = null;
    let epoch = 0; let connection: "connected" | "offline" | "expired" = "connected";
    const controllers = new Set<AbortController>(); let unbindOwner = () => {};
    const failed = <T>(code: string, message: string): RemoteResult<T> => ({ ok: false, error: { code, message } } as RemoteResult<T>);
    async function publish() { if (!ctx.signal.aborted) await ctx.events.emit(AccountSessionChanged, { current }); }
    async function status(state: typeof connection) {
      if (connection === state || ctx.signal.aborted) return;
      connection = state;
      if (state === "offline") logger.warn(ctx.pluginId, "Server connection interrupted");
      else logger.info(ctx.pluginId, "Server connection state changed", { data: { state } });
      await ctx.events.emit(ConnectionChanged, { state, epoch: `${ctx.activationId}:${epoch}` });
    }
    function retire() { epoch++; current = null; bearer = undefined; for (const controller of controllers) controller.abort(); controllers.clear(); }
    ctx.scope.own({ dispose() { unbindOwner(); retire(); } });
    async function request(method: "GET" | "POST", route: string, body?: unknown, owner: CancellationSignal = ctx.signal): Promise<RemoteResult<unknown>> {
      if (!address) return failed("UNAUTHENTICATED", "Connect to a server first.");
      if (!/^[a-zA-Z0-9/?=&._%-]+$/.test(route) || route.startsWith("/") || route.includes("..")) return failed("INVALID_ARGUMENT", "A relative API route is required.");
      if (ctx.signal.aborted || owner.aborted) return failed("CANCELLED", "The request was cancelled.");
      const version = epoch; const controller = new AbortController(); const abort = () => controller.abort();
      controllers.add(controller); owner.addEventListener("abort", abort, { once: true });
      try {
        const response = await fetcher(`${address}/api/v1/${route}`, { method, signal: controller.signal,
          credentials: options.mode === "browser" ? "same-origin" : "omit", redirect: "error",
          headers: { "Content-Type": "application/json", "X-Lunaris-Request": "1", "X-Lunaris-Client": options.mode,
            ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        const result = await response.json() as RemoteResult<unknown>;
        if (version !== epoch || owner.aborted || ctx.signal.aborted) return failed("CANCELLED", "The account session changed.");
        if (!result || typeof result.ok !== "boolean" || (!result.ok && (typeof result.error?.code !== "string" || typeof result.error?.message !== "string"))) return failed("PROTOCOL_MISMATCH", "The server returned an unsupported response.");
        if (!result.ok && ["SESSION_EXPIRED", "UNAUTHENTICATED"].includes(result.error.code) && current) { retire(); await status("expired"); await publish(); }
        else await status("connected");
        return result;
      } catch (error) {
        if (controller.signal.aborted || ctx.signal.aborted || version !== epoch) return failed("CANCELLED", "The request was cancelled.");
        if (!ctx.signal.aborted) logger.debug(ctx.pluginId, "Server request failed", { error });
        await status("offline"); return failed("OFFLINE", "The server is unavailable. Your unsaved changes remain local.");
      } finally { owner.removeEventListener("abort", abort); controllers.delete(controller); }
    }
    ctx.provide(ServerTransport, {
      current: () => current,
      async connect(value, owner) {
        let url: URL;
        try { url = new URL(value); if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw Error(); }
        catch { return failed("INVALID_ARGUMENT", "Enter an HTTP(S) server address."); }
        if (owner.aborted) return failed("CANCELLED", "The connection was cancelled.");
        unbindOwner(); retire(); address = url.origin; await publish();
        // Owner cleanup only retires local state; it must not publish through SDK.
        const abort = () => { retire(); address = ""; };
        owner.addEventListener("abort", abort, { once: true }); unbindOwner = () => owner.removeEventListener("abort", abort);
        const version = epoch; const result = await request("GET", "server", undefined, owner);
        if (!result.ok) return result;
        const info = result.value as ServerInfo;
        if (info?.protocol !== REMOTE_PROTOCOL || !["open", "invitation"].includes(info.registration) || typeof info.buildId !== "string") { address = ""; return failed("PROTOCOL_MISMATCH", "The server protocol is incompatible."); }
        if (options.mode === "browser") {
          const restored = await request("GET", "account", undefined, owner);
          if (restored.ok && version === epoch) { const account = restored.value as Account; if (typeof account?.id === "string" && typeof account.login === "string") { current = Object.freeze({ server: address, account: Object.freeze({ ...account }), epoch: `${ctx.activationId}:${epoch}` }); await publish(); } }
        }
        logger.info(ctx.pluginId, "Server connection ready"); return { ok: true, value: info };
      },
      register: async (login, password, invitation) => await request("POST", "auth/register", { login, password, invitation }) as RemoteResult<Account>,
      async login(login, password) {
        const version = epoch; const result = await request("POST", "auth/login", { login, password });
        if (!result.ok) return result;
        if (version !== epoch) return failed("CANCELLED", "The account session changed.");
        const value = result.value as { account: Account; token?: string };
        if (!value?.account || typeof value.account.id !== "string" || typeof value.account.login !== "string" || (options.mode === "desktop" && typeof value.token !== "string")) return failed("PROTOCOL_MISMATCH", "The server returned an invalid account.");
        bearer = value.token; current = Object.freeze({ server: address, account: Object.freeze({ ...value.account }), epoch: `${ctx.activationId}:${epoch}` }); await publish();
        logger.info(ctx.pluginId, "Account signed in"); return { ok: true, value: current.account };
      },
      async logout() {
        const result = await request("POST", "auth/logout", {}); if (!result.ok) return result as RemoteResult<null>;
        retire(); await publish(); logger.info(ctx.pluginId, "Account signed out"); return { ok: true, value: null };
      }, request,
    });
    logger.info(ctx.pluginId, "Server transport ready");
  } });
}
