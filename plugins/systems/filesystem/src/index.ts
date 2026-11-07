import { definePlugin } from "@lunaris/sdk";
import { DirectoryLocations, DirectoryLocationsDriver, validDirectoryName, Filesystem, FilesystemObservation, FilesystemObservationDriver, FilesystemDriver, FilesystemRoots, FilesystemRootsDriver, FilesystemLocations, FilesystemLocationsDriver, ApplicationDirectory, ApplicationDirectoryDriver, FileChanged, DriverFileChanged, failure, validTarget, validFolderLocation } from "@lunaris/filesystem";
import type { FileTarget, FsResult, WriteOptions } from "@lunaris/filesystem";
import { Logger } from "@lunaris/logging";
import manifest from "../manifest.json" with { type: "json" };
import { createObservation } from "./observation.js";
import { createRootLifecycle } from "./roots.js";
import { BeforeFileMutation } from "@lunaris/filesystem";
import type { FileMutation } from "@lunaris/filesystem";

export default definePlugin({ manifest, activate(ctx) {
  const logger = ctx.use(Logger);
  logger.debug(ctx.pluginId, "Activating filesystem provider");
  const directoryLocations = ctx.use(DirectoryLocationsDriver);
  const driver = ctx.use(FilesystemDriver);
  const observationDriver = ctx.use(FilesystemObservationDriver);
  const directories = ctx.use(ApplicationDirectoryDriver);
  const ownedRoots = ctx.use(FilesystemRootsDriver);
  const locations = ctx.use(FilesystemLocationsDriver);
  const roots = createRootLifecycle(ctx, id => call("closeVault", () => driver.closeVault(id)));
  const snapshot = (target: FileTarget): FileTarget => Object.freeze({ vaultId: target.vaultId, path: target.path });
  let mutations: Promise<unknown> = Promise.resolve();
  function mutate(input: Omit<FileMutation, "error" | "onSettled">, work: () => Promise<FsResult<null>>): Promise<FsResult<null>> {
    const run = async (): Promise<FsResult<null>> => {
      const listeners: ((result: FsResult<null>) => void | Promise<void>)[] = [];
      let result: FsResult<null> = failure("CANCELLED", "Mutation did not complete.");
      try {
        if (ctx.signal.aborted) return result;
        const guard = await ctx.hooks.run(BeforeFileMutation, Object.freeze({ ...input, error: null,
          onSettled: (listener: (result: FsResult<null>) => void | Promise<void>) => { listeners.push(listener); } }));
        if (guard.error) result = { ok: false, error: guard.error };
        else if (!ctx.signal.aborted) result = await work();
        return result;
      } catch (error) {
        if (!ctx.signal.aborted) logger.error(ctx.pluginId, "File mutation guard failed", { error });
        result = failure("IO_ERROR", "File mutation failed."); return result;
      } finally {
        for (const listener of listeners) {
          try { await listener(result); }
          catch (error) { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "File mutation completion failed", { error }); }
        }
      }
    };
    const task = mutations.then(run); mutations = task.catch(() => {}); return task;
  }
  async function call<T>(operation: string, work: () => Promise<FsResult<T>>, target?: FileTarget): Promise<FsResult<T>> {
    let result: FsResult<T>;
    try { result = await work(); }
    catch (error) {
      if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Unexpected filesystem driver failure", { code: "FILESYSTEM_DRIVER_FAILED", error, data: { operation } });
      throw error;
    }
    if (!ctx.signal.aborted) {
      const data = { operation, ...(target ? { vaultId: target.vaultId, path: target.path } : {}) };
      if (!result.ok) logger.error(ctx.pluginId, "Filesystem operation failed", { code: result.error.code, error: result.error, data });
      else if (["selectVault", "closeVault", "writeText", "writeFile", "createDirectory", "remove", "move", "copy"].includes(operation)) {
        if (result.value !== null || operation !== "selectVault") logger.info(ctx.pluginId, "Filesystem operation completed", { data });
      } else logger.debug(ctx.pluginId, "Filesystem operation completed", { data });
    }
    return result;
  }
  function onTarget<T>(operation: string, target: FileTarget, allowRoot: boolean, work: (copy: FileTarget) => Promise<FsResult<T>>): Promise<FsResult<T>> {
    if (!validTarget(target, allowRoot)) return call(operation, async () => failure("INVALID_PATH", "A valid Vault-relative path is required."));
    const copy = snapshot(target);
    return call(operation, () => roots.run(copy.vaultId, () => work(copy)), copy);
  }
  function writeOptions(value: unknown): value is WriteOptions {
    if (value === null || typeof value !== "object") return false;
    const options = value as { readonly mode?: unknown; readonly expectedVersion?: unknown };
    return typeof options.mode === "string" && ["create", "replace", "upsert"].includes(options.mode) &&
      (options.expectedVersion === undefined || (typeof options.expectedVersion === "string" && options.mode !== "create"));
  }
  const transfer = (operation: "move" | "copy", source: FileTarget, destination: FileTarget, overwrite = false) =>
    onTarget(operation, source, false, copy => {
      if (!validTarget(destination) || destination.vaultId !== copy.vaultId) return Promise.resolve(failure("INVALID_PATH", "Transfers must stay within one Vault."));
      const next = snapshot(destination);
      return mutate({ operation, source: copy, destination: next, overwrite }, () => driver[operation](copy, next, overwrite));
    });
  const observation = createObservation(ctx, (target, recursive) => onTarget("watch", target, true, copy => observationDriver.watch(copy, ctx.signal, recursive)),
    (vaultId, watchId) => roots.run(vaultId, () => call("unwatch", () => driver.unwatch(vaultId, watchId))),
    error => logger.error(ctx.pluginId, "Cannot release filesystem observation", { code: "OBSERVATION_RELEASE_FAILED", error }));
  ctx.provide(FilesystemObservation, { watch: (target, owner, recursive) => observation.watch({ ...target }, owner, recursive) });
  ctx.events.on(DriverFileChanged, async change => {
    if (!observation.accepts(change.vaultId, change.watchId)) return;
    try { await ctx.events.emit(FileChanged, change); }
    catch (error) { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot publish filesystem change", { code: "FILESYSTEM_EVENT_FAILED", error }); }
  });
  ctx.provide(Filesystem, {
    capabilities: () => driver.capabilities(),
    selectVault: () => call("selectVault", () => driver.selectVault()),
    closeVault: async vaultId => {
      const result = await roots.close(vaultId);
      if (result.ok || result.error.code === "VAULT_CLOSED") observation.close(vaultId);
      return result;
    },
    pickFile: vaultId => roots.run(vaultId, () => call("pickFile", () => driver.pickFile(vaultId))),
    pickDirectory: vaultId => roots.run(vaultId, () => call("pickDirectory", () => driver.pickDirectory(vaultId))),
    pickSaveLocation: vaultId => roots.run(vaultId, () => call("pickSaveLocation", () => driver.pickSaveLocation(vaultId))),
    readText: target => onTarget("readText", target, false, copy => driver.readText(copy)),
    readFile: target => onTarget("readFile", target, false, copy => driver.readFile(copy)),
    writeText: (target, text, options) => onTarget("writeText", target, false, copy => {
      if (typeof text !== "string" || !writeOptions(options)) return Promise.resolve(failure("INVALID_ARGUMENT", "Valid text and explicit write mode are required."));
      return driver.writeText(copy, text, { ...options });
    }),
    writeFile: (target, data, options) => onTarget("writeFile", target, false, copy => {
      if (!Array.isArray(data) || !data.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255) || !writeOptions(options)) return Promise.resolve(failure("INVALID_ARGUMENT", "Valid bytes and explicit write mode are required."));
      return driver.writeFile(copy, [...data], { ...options });
    }),
    stat: target => onTarget("stat", target, true, copy => driver.stat(copy)),
    list: target => onTarget("list", target, true, copy => driver.list(copy)),
    createDirectory: (target, recursive = false) => onTarget("createDirectory", target, false, copy => driver.createDirectory(copy, recursive)),
    remove: (target, recursive = false) => onTarget("remove", target, false, copy => mutate({ operation: "remove", source: copy, destination: null, overwrite: false }, () => driver.remove(copy, recursive))),
    move: (source, destination, overwrite = false) => transfer("move", source, destination, overwrite),
    copy: (source, destination, overwrite = false) => transfer("copy", source, destination, overwrite),
    watch: (target, recursive = true) => onTarget("watch", target, true, copy => driver.watch(copy, recursive)),
    unwatch: (vaultId, watchId) => observation.unwatch(vaultId, watchId),
  });
  ctx.provide(FilesystemRoots, { selectVault: owner => call("selectVault", () => ownedRoots.selectVault(owner)) });
  ctx.provide(DirectoryLocations, { create(parent, name, owner) {
    if (!validFolderLocation(parent) || !validDirectoryName(name)) return Promise.resolve(failure("INVALID_PATH", "A valid parent and portable directory name are required."));
    return call("createLocation", () => directoryLocations.create({ ...parent }, name, owner));
  } });
  ctx.provide(FilesystemLocations, {
    describe(reference) {
      if (typeof reference !== "string" || !reference.length || reference.length > 512) return Promise.resolve(failure("INVALID_ARGUMENT", "A valid location reference is required."));
      return call("describeLocation", () => locations.describe(reference));
    },
    select: owner => call("selectLocation", () => locations.select(owner)),
    attach(location, owner) {
      if (!validFolderLocation(location)) return Promise.resolve(failure("INVALID_ARGUMENT", "A valid folder location is required."));
      const copy = Object.freeze({ reference: location.reference, label: location.label });
      return call("attachLocation", () => locations.attach(copy, owner));
    },
  });
  ctx.provide(ApplicationDirectory, { openConfig: owner => call("openConfig", () => directories.openConfig(owner)) });
  logger.info(ctx.pluginId, "Filesystem provider ready", { code: "FILESYSTEM_READY" });
} });
