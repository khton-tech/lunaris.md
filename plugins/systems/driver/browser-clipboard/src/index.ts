import { definePlugin } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { ClipboardDriver } from "@lunaris/clipboard";
import type { ClipboardResult } from "@lunaris/clipboard";
/** Browser/WebView clipboard access stays in this replaceable platform driver. */
export function createBrowserClipboard(navigation: Pick<Navigator, "clipboard"> = navigator) {
 return definePlugin({ manifest: { manifestVersion: 1, id: "lunaris.browser-clipboard", version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./dist/index.js",
  provides: [{ kind: ClipboardDriver.kind, id: ClipboardDriver.id, version: ClipboardDriver.version }], requires: [{ kind: Logger.kind, id: Logger.id, range: "^1.0.0" }], permissions: ["clipboard.native"], optionalPermissions: [] }, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal);
  const capabilities = () => Object.freeze({ read: typeof navigation.clipboard?.readText === "function", write: typeof navigation.clipboard?.writeText === "function" });
  const cancelled = (): ClipboardResult<never> => ({ ok: false, error: { code: "CANCELLED", message: "Clipboard driver stopped." } });
  async function perform<T>(operation: "read" | "write", work: () => Promise<T>): Promise<ClipboardResult<T>> {
   if (!capabilities()[operation]) return { ok: false, error: { code: "UNSUPPORTED", message: "Clipboard access is unavailable in this host." } };
   try { const value = await work(); if (ctx.signal.aborted) return cancelled(); logger.info(ctx.pluginId, "Clipboard operation completed", { data: { operation } }); return { ok: true, value }; }
   catch (error) { if (ctx.signal.aborted) return cancelled(); logger.warn(ctx.pluginId, "Clipboard operation failed", { data: { operation }, error });
    return { ok: false, error: { code: error instanceof Error && error.name === "NotAllowedError" ? "DENIED" : "FAILED", message: "Clipboard operation was not permitted or failed." } }; }
  }
  ctx.provide(ClipboardDriver, { capabilities, readText: () => perform("read", () => navigation.clipboard.readText()), writeText: text => perform("write", async () => { await navigation.clipboard.writeText(text); return null; }) });
  if (!capabilities().read || !capabilities().write) logger.warn(ctx.pluginId, "Clipboard capabilities unavailable; native keyboard shortcuts remain available");
  logger.info(ctx.pluginId, "Clipboard driver ready");
 } });
}
