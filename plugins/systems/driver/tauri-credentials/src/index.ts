import { invoke } from "@tauri-apps/api/core";
import { definePlugin } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { SessionCredentials, validSavedServerSession } from "@lunaris/remote";
import type { RemoteResult, SavedServerSession } from "@lunaris/remote";
export type CredentialBridge = (operation: string, value?: unknown) => Promise<RemoteResult<unknown>>;
export function createTauriCredentials(bridge: CredentialBridge = (operation, value) => invoke("credentials_request", { operation, value: value ?? null })) {
  return definePlugin({ manifest: { manifestVersion: 1, id: "lunaris.tauri-credentials", version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./dist/index.js",
    provides: [{ kind: "api", id: SessionCredentials.id, version: SessionCredentials.version }], requires: [{ kind: "api", id: Logger.id, range: "^1.0.0" }],
    permissions: ["credentials.native"], optionalPermissions: [] }, activate(ctx) {
    const logger = scopeLogger(ctx.use(Logger), ctx.signal);
    async function request<T>(operation: string, value?: unknown): Promise<RemoteResult<T>> {
      try {
        const result = await bridge(operation, value);
        if (ctx.signal.aborted) return { ok: false, error: { code: "CANCELLED", message: "Credential storage stopped." } };
        if (!result.ok) logger.warn(ctx.pluginId, "Secure session storage unavailable", { code: result.error.code, error: result.error, data: { operation } });
        else if (operation !== "load") logger.info(ctx.pluginId, "Saved session updated", { data: { operation } });
        return result as RemoteResult<T>;
      } catch (error) {
        if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Secure session bridge failed", { error });
        return { ok: false, error: { code: "IO_ERROR", message: "Secure session storage is unavailable." } };
      }
    }
    ctx.provide(SessionCredentials, {
      async load() { const result = await request<SavedServerSession | null>("load"); return result.ok && result.value !== null && !validSavedServerSession(result.value)
        ? { ok: false, error: { code: "INVALID_ARGUMENT", message: "Invalid saved session." } } : result; },
      save(session) { if (!validSavedServerSession(session)) return Promise.resolve({ ok: false, error: { code: "INVALID_ARGUMENT", message: "Invalid saved session." } }); return request<null>("save", session); },
      remove: token => request<null>("remove", token),
    });
    logger.info(ctx.pluginId, "Secure session storage ready");
  } });
}
