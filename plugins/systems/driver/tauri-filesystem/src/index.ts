import { definePlugin } from "@lunaris/sdk";
import { FilesystemDriver, ApplicationDirectoryDriver, DriverFileChanged, failure } from "@lunaris/filesystem";
import type { FileChange, FsResult, FsCapabilities } from "@lunaris/filesystem";
import { Logger } from "@lunaris/logging";
import { nativeFilesystem, createSessionId } from "./native.js";
import type { NativeFilesystem } from "./native.js";
import manifest from "../manifest.json" with { type: "json" };

const capabilities: FsCapabilities = Object.freeze({ watch: true, atomicReplace: true, versionCheck: "optimistic", trash: false, maxFileBytes: 64 * 1024 * 1024 });

export function createTauriFilesystemDriver(native: NativeFilesystem = nativeFilesystem) {
  return definePlugin({ manifest, async activate(ctx) {
    const logger = ctx.use(Logger);
    logger.debug(ctx.pluginId, "Activating native filesystem driver");
    const sessionId = createSessionId();
    const watches = new Map<string, string>();
    const events = (change: FileChange): void => {
      if (ctx.signal.aborted || watches.get(change.watchId) !== change.vaultId) return;
      void ctx.events.emit(DriverFileChanged, change).catch(error => {
        if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot deliver native filesystem change", { code: "FILESYSTEM_EVENT_FAILED", error });
      });
    };
    async function request<T>(operation: string, args: Readonly<Record<string, unknown>> = {}): Promise<FsResult<T>> {
      try {
        const result = await native.request<T>(sessionId, operation, args, operation === "watch" ? events : undefined);
        if (result.ok && !ctx.signal.aborted) {
          if (operation === "watch" && typeof result.value === "string") watches.set(result.value, (args.target as { vaultId: string }).vaultId);
          if (operation === "unwatch") watches.delete(args.watchId as string);
          if (operation === "closeVault") for (const [id, vault] of watches) { if (vault === args.vaultId) watches.delete(id); }
        }
        if (!result.ok && !ctx.signal.aborted) logger.debug(ctx.pluginId, "Native filesystem operation declined", { code: result.error.code, error: result.error, data: { operation } });
        return result;
      } catch (error) {
        if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Native filesystem bridge failed", { code: "FILESYSTEM_BRIDGE_FAILED", error, data: { operation } });
        return failure("IO_ERROR", "Native filesystem bridge failed.");
      }
    }
    // Own native cleanup before awaiting initialization, including late activation completion.
    ctx.scope.own({ async dispose() {
      watches.clear();
      const result = await native.request<null>(sessionId, "end", {});
      if (!result.ok) throw new Error(`Native filesystem cleanup failed: ${result.error.code}`);
    } });
    const opened = await request<null>("begin");
    ctx.signal.throwIfAborted();
    if (!opened.ok) throw new Error(`Cannot initialize native filesystem: ${opened.error.code}`);
    ctx.provide(ApplicationDirectoryDriver, { openConfig: () => request("openConfig") });
    ctx.provide(FilesystemDriver, {
      capabilities: () => capabilities,
      selectVault: () => request("selectVault"),
      closeVault: vaultId => request("closeVault", { vaultId }),
      pickFile: vaultId => request("pickFile", { vaultId }),
      pickDirectory: vaultId => request("pickDirectory", { vaultId }),
      pickSaveLocation: vaultId => request("pickSaveLocation", { vaultId }),
      readText: target => request("readText", { target }),
      readFile: target => request("readFile", { target }),
      writeText: (target, text, options) => request("writeText", { target, text, options }),
      writeFile: (target, data, options) => request("writeFile", { target, data, options }),
      stat: target => request("stat", { target }),
      list: target => request("list", { target }),
      createDirectory: (target, recursive = false) => request("createDirectory", { target, recursive }),
      remove: (target, recursive = false) => request("remove", { target, recursive }),
      move: (source, destination, overwrite = false) => request("move", { source, destination, overwrite }),
      copy: (source, destination, overwrite = false) => request("copy", { source, destination, overwrite }),
      watch: (target, recursive = true) => request("watch", { target, recursive }),
      unwatch: (vaultId, watchId) => request("unwatch", { vaultId, watchId }),
    });
    logger.info(ctx.pluginId, "Native filesystem driver ready", { code: "FILESYSTEM_DRIVER_READY" });
  } });
}

export default createTauriFilesystemDriver();
