import { definePlugin } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { SessionCredentials, validSavedServerSession, REMOTE_FILE_LIMITS, remoteFileContentFits, ConnectionStatus, ServerTransport, REMOTE_PROTOCOL, AccountSessionChanged, ConnectionChanged } from "@lunaris/remote";
import type { SavedServerSession, ServerTransportApi, AccountState, Account, RemoteResult, ServerInfo } from "@lunaris/remote";

export function createServerTransport(options: { readonly mode: "browser" | "desktop"; readonly fetch?: typeof fetch; readonly timeoutMs?: number }) {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? 30000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw Error("A positive request timeout is required.");
  return definePlugin({ manifest: { manifestVersion: 1, id: "lunaris.server-transport", version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./dist/index.js",
    provides: [ConnectionStatus, ServerTransport, AccountSessionChanged, ConnectionChanged].map(t => ({ kind: t.kind, id: t.id, version: t.version })),
    requires: [{ kind: "api", id: Logger.id, range: "^1.0.0" }, ...(options.mode === "desktop" ? [{ kind: "api" as const, id: SessionCredentials.id, range: "^1.0.0", optional: true }] : [])],
    permissions: [], optionalPermissions: options.mode === "desktop" ? ["credentials.access"] : [] }, async activate(ctx) {
    const logger = scopeLogger(ctx.use(Logger), ctx.signal); let address = ""; let bearer: string | undefined; let current: AccountState | null = null;
    const credentials = options.mode === "desktop" && ctx.permissions.has("credentials.access") ? ctx.optional(SessionCredentials) : undefined;
    let initialized = false;
    let saved: SavedServerSession | null = null;
    let persistence = Promise.resolve();
    function persist(work: () => Promise<void>): Promise<void> {
      const next = persistence.then(work); persistence = next.catch(() => {}); return next;
    }
    async function forget(token: string | undefined) {
      if (!token || !credentials) return;
      await persist(async () => {
        if (ctx.signal.aborted) return;
        const result = await credentials.remove(token);
        if (!result.ok && !ctx.signal.aborted) logger.warn(ctx.pluginId, "Cannot clear saved session", { code: result.error.code });
        if (saved?.token === token) saved = null;
      });
    }
    let connectionGeneration = 0; let epoch = 0; let connection: "connected" | "offline" | "expired" | "unknown" = "unknown";
    const controllers = new Set<AbortController>(); const deadlines = new Map<AbortController, ReturnType<typeof setTimeout>>(); let unbindOwner = () => {};
    const failed = <T>(code: string, message: string): RemoteResult<T> => ({ ok: false, error: { code, message } } as RemoteResult<T>);
    async function publish() { if (initialized && !ctx.signal.aborted) await ctx.events.emit(AccountSessionChanged, { current }); }
    async function status(state: "connected" | "offline" | "expired") {
      if (connection === state || ctx.signal.aborted) return;
      connection = state;
      if (state === "offline") logger.warn(ctx.pluginId, "Server connection interrupted");
      else logger.info(ctx.pluginId, "Server connection state changed", { data: { state } });
      if (initialized) await ctx.events.emit(ConnectionChanged, { state, epoch: `${ctx.activationId}:${epoch}` });
    }
    function retire() { connection = "unknown"; epoch++; current = null; bearer = undefined; for (const controller of controllers) controller.abort(); controllers.clear(); for (const timer of deadlines.values()) clearTimeout(timer); deadlines.clear(); }
    ctx.scope.own({ dispose() { unbindOwner(); retire(); } });
    async function request(method: "GET" | "POST", route: string, body?: unknown, owner: CancellationSignal = ctx.signal): Promise<RemoteResult<unknown>> {
      if (!address) return failed("UNAUTHENTICATED", "Connect to a server first.");
      if (!/^[a-zA-Z0-9/?=&._%-]+$/.test(route) || route.startsWith("/") || route.includes("..")) return failed("INVALID_ARGUMENT", "A relative API route is required.");
      if (ctx.signal.aborted || owner.aborted) return failed("CANCELLED", "The request was cancelled.");
      const fileRequest = route.endsWith("/files") && body !== null && typeof body === "object" ? body as { operation?: string; args?: object } : null;
      if (fileRequest && !remoteFileContentFits(fileRequest.operation ?? "", fileRequest.args ?? {})) return failed("TOO_LARGE", "The file exceeds the remote content limit.");
      const encodedBody = body === undefined ? undefined : JSON.stringify(body);
      if (fileRequest && encodedBody && new TextEncoder().encode(encodedBody).byteLength > REMOTE_FILE_LIMITS.maxRequestBytes) return failed("TOO_LARGE", "The encoded file request exceeds the remote request limit.");
      const version = epoch; const controller = new AbortController(); const abort = () => controller.abort();
      let timedOut = false;
      const deadline = setTimeout(() => { timedOut = true; controller.abort(); }, initialized ? timeoutMs : Math.min(timeoutMs, 5000)); deadlines.set(controller, deadline);
      controllers.add(controller); owner.addEventListener("abort", abort, { once: true });
      try {
        const response = await fetcher(`${address}/api/v1/${route}`, { method, signal: controller.signal,
          credentials: options.mode === "browser" ? "same-origin" : "omit", redirect: "error",
          headers: { "Content-Type": "application/json", "X-Lunaris-Request": "1", "X-Lunaris-Client": options.mode,
            ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, ...(encodedBody === undefined ? {} : { body: encodedBody }) });
        let result: RemoteResult<unknown>;
        try { result = await response.json() as RemoteResult<unknown>; }
        catch {
          if (version !== epoch || owner.aborted || ctx.signal.aborted) return failed("CANCELLED", "The account session changed.");
          if (timedOut || response.status >= 500) { await status("offline"); return failed("SERVER_UNAVAILABLE", "The server response is unavailable or timed out."); }
          return failed(response.status >= 500 ? "SERVER_UNAVAILABLE" : "PROTOCOL_MISMATCH", "The server returned an unsupported response.");
        }
        if (version !== epoch || owner.aborted || ctx.signal.aborted) return failed("CANCELLED", "The account session changed.");
        if (!result || typeof result.ok !== "boolean" || (!result.ok && (typeof result.error?.code !== "string" || typeof result.error?.message !== "string"))) return failed("PROTOCOL_MISMATCH", "The server returned an unsupported response.");
        if (!result.ok && ["SESSION_EXPIRED", "UNAUTHENTICATED"].includes(result.error.code) && (current || bearer)) { const token = bearer; retire(); await forget(token); await status("expired"); await publish(); }
        else if (response.status >= 500 || (!result.ok && ["SERVER_UNAVAILABLE", "OFFLINE"].includes(result.error.code))) await status("offline");
        else await status("connected");
        return result;
      } catch (error) {
        if (timedOut && !ctx.signal.aborted && !owner.aborted && version === epoch) { await status("offline"); return failed("SERVER_UNAVAILABLE", "The server request timed out. Your unsaved changes remain local."); }
        if (controller.signal.aborted || ctx.signal.aborted || version !== epoch) return failed("CANCELLED", "The request was cancelled.");
        if (!ctx.signal.aborted) logger.debug(ctx.pluginId, "Server request failed", { error });
        await status("offline"); return failed("OFFLINE", "The server is unavailable. Your unsaved changes remain local.");
      } finally { clearTimeout(deadline); deadlines.delete(controller); owner.removeEventListener("abort", abort); controllers.delete(controller); }
    }
    ctx.provide(ConnectionStatus, { current: () => address ? Object.freeze({ server: address, epoch: `${ctx.activationId}:${epoch}`, state: connection }) : null });
    const api: ServerTransportApi = {
      current: () => current,
      async connect(value, owner) {
        let url: URL;
        try { url = new URL(value); if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw Error(); }
        catch { return failed("INVALID_ARGUMENT", "Enter an HTTP(S) server address."); }
        if (owner.aborted) return failed("CANCELLED", "The connection was cancelled.");
        unbindOwner(); retire(); address = url.origin;
        const candidate = saved?.server === address ? saved : null;
        if (candidate) bearer = candidate.token;
        const generation = ++connectionGeneration; const version = epoch;
        // Owner cleanup only retires local state; it must not publish through SDK.
        const abort = () => { if (generation === connectionGeneration) { retire(); address = ""; } };
        owner.addEventListener("abort", abort, { once: true }); unbindOwner = () => owner.removeEventListener("abort", abort);
        await publish();
        if (version !== epoch || owner.aborted || ctx.signal.aborted) return failed("CANCELLED", "The connection was superseded or cancelled.");
        const result = await request("GET", "server", undefined, owner);
        if (version !== epoch || owner.aborted || ctx.signal.aborted) return failed("CANCELLED", "The connection was superseded or cancelled.");
        if (!result.ok) {
          if (candidate && ["OFFLINE", "SERVER_UNAVAILABLE"].includes(result.error.code)) {
            current = Object.freeze({ server: address, account: Object.freeze({ ...candidate.account }), epoch: `${ctx.activationId}:${epoch}` });
            await publish();
          }
          return result;
        }
        const info = result.value as ServerInfo;
        if ((info?.name !== undefined && (typeof info.name !== "string" || !info.name.trim() || info.name.length > 80)) || (info?.description !== undefined && (typeof info.description !== "string" || info.description.length > 280))) return failed("PROTOCOL_MISMATCH", "Invalid public server information.");
        if ((info?.limits !== undefined && (!Number.isSafeInteger(info.limits.maxFileBytes) || info.limits.maxFileBytes < REMOTE_FILE_LIMITS.maxFileBytes || !Number.isSafeInteger(info.limits.maxRequestBytes) || info.limits.maxRequestBytes < REMOTE_FILE_LIMITS.maxRequestBytes)) || info?.protocol !== REMOTE_PROTOCOL || !["open", "invitation"].includes(info.registration) || typeof info.buildId !== "string") { address = ""; return failed("PROTOCOL_MISMATCH", "The server protocol is incompatible."); }
        if (options.mode === "browser" || candidate) {
          const restored = await request("GET", "account", undefined, owner);
          if (candidate && !restored.ok && ["OFFLINE", "SERVER_UNAVAILABLE"].includes(restored.error.code) && version === epoch) {
            current = Object.freeze({ server: address, account: Object.freeze({ ...candidate.account }), epoch: `${ctx.activationId}:${epoch}` }); await publish();
          }
          if (restored.ok && candidate && (restored.value as Account)?.id !== candidate.account.id) { const token = bearer; retire(); await forget(token); return failed("PROTOCOL_MISMATCH", "Saved account identity changed."); }
          if (restored.ok && version === epoch) { const account = restored.value as Account; if (typeof account?.id === "string" && typeof account.login === "string") { current = Object.freeze({ server: address, account: Object.freeze({ ...account }), epoch: `${ctx.activationId}:${epoch}` }); await publish(); } }
        }
        if (ctx.signal.aborted || version !== epoch) return failed("CANCELLED", "The connection owner stopped.");
        logger.info(ctx.pluginId, "Server connection ready"); return { ok: true, value: info };
      },
      register: async (login, password, invitation) => await request("POST", "auth/register", { login, password, invitation }) as RemoteResult<Account>,
      async login(login, password) {
        const version = epoch; const result = await request("POST", "auth/login", { login, password });
        if (!result.ok) return result;
        if (version !== epoch) return failed("CANCELLED", "The account session changed.");
        const value = result.value as { account: Account; token?: string };
        if (!value?.account || typeof value.account.id !== "string" || typeof value.account.login !== "string" || (options.mode === "desktop" && typeof value.token !== "string")) return failed("PROTOCOL_MISMATCH", "The server returned an invalid account.");
        retire(); connection = "connected"; const committedEpoch = epoch;
        bearer = value.token; current = Object.freeze({ server: address, account: Object.freeze({ ...value.account }), epoch: `${ctx.activationId}:${epoch}` });
        if (credentials && bearer) {
          const record = { server: address, account: { ...value.account }, token: bearer };
          await persist(async () => {
            if (ctx.signal.aborted || committedEpoch !== epoch) return;
            const result = await credentials.save(record);
            if (ctx.signal.aborted) return;
            if (result.ok) { saved = record; logger.info(ctx.pluginId, "Server session saved securely"); }
            else logger.warn(ctx.pluginId, "Session will not survive restart", { code: result.error.code });
          });
        }
        if (ctx.signal.aborted || committedEpoch !== epoch) return failed("CANCELLED", "The account session changed.");
        await publish();
        if (ctx.signal.aborted || committedEpoch !== epoch || !current) return failed("CANCELLED", "The account session changed.");
        logger.info(ctx.pluginId, "Account signed in"); return { ok: true, value: current.account };
      },
      async logout() {
        const token = bearer; const result = await request("POST", "auth/logout", {}); if (!result.ok) return result as RemoteResult<null>;
        retire(); await forget(token); await publish(); if (!ctx.signal.aborted) logger.info(ctx.pluginId, "Account signed out"); return { ok: true, value: null };
      }, request,
    };
    if (credentials) {
      const restored = await credentials.load();
      if (ctx.signal.aborted) return;
      if (restored.ok && restored.value && validSavedServerSession(restored.value)) {
        saved = restored.value;
        const result = await api.connect(saved.server, ctx.signal);
        if (ctx.signal.aborted) return;
        if (!result.ok) logger.warn(ctx.pluginId, "Saved session reconnect deferred", { code: result.error.code });
        else logger.info(ctx.pluginId, "Saved session checked");
      } else if (!restored.ok) logger.warn(ctx.pluginId, "Saved session unavailable", { code: restored.error.code });
    } else if (options.mode === "desktop") logger.warn(ctx.pluginId, "Secure storage unavailable; session is memory-only");
    ctx.provide(ServerTransport, api);
    initialized = true;
    logger.info(ctx.pluginId, "Server transport ready");
  } });
}
