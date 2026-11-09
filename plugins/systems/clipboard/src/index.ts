import { definePlugin } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import type { ClipboardResult } from "@lunaris/clipboard";
import { Clipboard, ClipboardDriver } from "@lunaris/clipboard";
export default definePlugin({ manifest: { manifestVersion: 1, id: "lunaris.clipboard-provider", version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./dist/index.js",
 provides: [{ kind: Clipboard.kind, id: Clipboard.id, version: Clipboard.version }], requires: [Logger, ClipboardDriver].map(t => ({ kind: t.kind, id: t.id, range: "^1.0.0" })), permissions: ["clipboard.access"], optionalPermissions: [] }, activate(ctx) {
 const logger = scopeLogger(ctx.use(Logger), ctx.signal); const driver = ctx.use(ClipboardDriver);
 async function forward<T>(operation: string, work: () => Promise<ClipboardResult<T>>): Promise<ClipboardResult<T>> {
  try {
   const result = await work();
   if (!ctx.signal.aborted) { if (result.ok) logger.debug(ctx.pluginId, "Clipboard request completed", { data: { operation } }); else logger.warn(ctx.pluginId, "Clipboard request failed", { data: { operation }, error: result.error }); }
   return result;
  } catch (error) {
   if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Clipboard driver request failed", { data: { operation }, error });
   return { ok:false, error:{ code:ctx.signal.aborted ? "CANCELLED" : "FAILED", message:"Clipboard request failed." } };
  }
 }
 ctx.provide(Clipboard, { capabilities: () => driver.capabilities(), readText: () => forward("read", () => driver.readText()), writeText: text => forward("write", () => driver.writeText(text)) });
 logger.info(ctx.pluginId, "Clipboard provider ready");
} });
