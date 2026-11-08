import { definePlugin } from "@lunaris/sdk";
import type { CancellationSignal, ApiToken, EventToken } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { FilesystemDriver, FilesystemRootsDriver, FilesystemLocationsDriver, DirectoryLocationsDriver, ApplicationDirectoryDriver,
  FilesystemObservationDriver, DriverFileChanged, FilesystemSources, failure, validFolderLocation, validTarget } from "@lunaris/filesystem";
import type { FilesystemBackendApi, FileChange, FsResult, VaultRoot, FolderLocation, FsCapabilities, FileTarget } from "@lunaris/filesystem";

export interface BackendSource {
  readonly id: string;
  readonly api: ApiToken<FilesystemBackendApi>;
  readonly changed: EventToken<FileChange>;
}
interface Attachment { readonly backend: FilesystemBackendApi; readonly nativeId: string; readonly owner: CancellationSignal; readonly detach: () => void }

/** Host-configured source bindings; every backend handle is acquired through SDK. */
export function createFilesystemRouter(sources: readonly BackendSource[], defaultSource: string) {
  const bindings = sources.map(source => Object.freeze({ ...source }));
  if (!bindings.length || new Set(bindings.map(s => s.id)).size !== bindings.length ||
    !bindings.some(s => s.id === defaultSource) || bindings.some(s => !/^[a-z][a-z0-9.-]{0,79}$/.test(s.id))) throw new Error("Invalid filesystem source configuration.");
  const provided = [FilesystemDriver, FilesystemRootsDriver, FilesystemLocationsDriver, DirectoryLocationsDriver,
    ApplicationDirectoryDriver, FilesystemObservationDriver, DriverFileChanged, FilesystemSources];
  return definePlugin({ manifest: {
    manifestVersion: 1, id: "lunaris.filesystem-router", version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./dist/index.js",
    provides: provided.map(token => ({ kind: token.kind, id: token.id, version: token.version })),
    requires: [Logger, ...bindings.flatMap(s => [s.api, s.changed])].map(token => ({ kind: token.kind, id: token.id, range: `^${token.version}` })),
    permissions: ["filesystem.native", "filesystem.access", "filesystem.app-config"], optionalPermissions: [],
  }, activate(ctx) {
    const logger = ctx.use(Logger);
    const backends = new Map(bindings.map(source => [source.id, ctx.use(source.api)]));
    const primary = backends.get(defaultSource)!;
    const roots = new Map<string, Attachment>();
    const watches = new Map<string, { rootId: string; nativeId: string; detach: () => void }>();
    let sequence = 0;
    const nextId = () => `${ctx.activationId}:${++sequence}`;
    function forget(rootId: string) {
      roots.get(rootId)?.detach(); roots.delete(rootId);
      for (const [id, watch] of watches) if (watch.rootId === rootId) { watch.detach(); watches.delete(id); }
    }
    ctx.scope.own({ dispose() { for (const id of roots.keys()) forget(id); watches.clear(); } });
    const closed = () => failure("VAULT_CLOSED", "The filesystem attachment is closed.");
    function rootWork<T>(rootId: string, work: (entry: Attachment) => Promise<FsResult<T>>): Promise<FsResult<T>> {
      const entry = roots.get(rootId);
      return entry && !ctx.signal.aborted ? work(entry) : Promise.resolve(closed());
    }
    function targetWork<T>(target: FileTarget, work: (backend: FilesystemBackendApi, target: FileTarget) => Promise<FsResult<T>>): Promise<FsResult<T>> {
      if (!validTarget(target, true)) return Promise.resolve(failure("INVALID_PATH", "A relative filesystem target is required."));
      return rootWork(target.vaultId, entry => work(entry.backend, { vaultId: entry.nativeId, path: target.path }));
    }
    async function acquire(backend: FilesystemBackendApi, owner: CancellationSignal, work: () => Promise<FsResult<VaultRoot | null>>): Promise<FsResult<VaultRoot | null>> {
      if (owner.aborted || ctx.signal.aborted) return failure("CANCELLED", "Attachment cancelled.");
      const result = await work();
      // Backend-owned acquisition releases late roots on cancellation; never call a closed SDK handle.
      if (owner.aborted || ctx.signal.aborted) return failure("CANCELLED", "Attachment cancelled.");
      if (!result.ok || result.value === null) return result;
      const rootId = nextId();
      const abort = () => forget(rootId);
      roots.set(rootId, { backend, nativeId: result.value.id, owner, detach: () => owner.removeEventListener("abort", abort) });
      owner.addEventListener("abort", abort, { once: true });
      logger.info(ctx.pluginId, "Filesystem source attached");
      return { ok: true, value: Object.freeze({ id: rootId, name: result.value.name }) };
    }
    async function acquireRequired(backend: FilesystemBackendApi, owner: CancellationSignal, work: () => Promise<FsResult<VaultRoot>>): Promise<FsResult<VaultRoot>> {
      const result = await acquire(backend, owner, work);
      return result.ok && result.value === null ? failure("IO_ERROR", "Backend did not return an attachment.") : result as FsResult<VaultRoot>;
    }
    function wrap(sourceId: string, location: FolderLocation): FsResult<FolderLocation> {
      if (!backends.has(sourceId) || !validFolderLocation(location)) return failure("INVALID_ARGUMENT", "A registered source and location are required.");
      const reference = JSON.stringify(["lunaris-source-v1", sourceId, location.reference]);
      const value = { reference, label: location.label };
      return validFolderLocation(value) ? { ok: true, value: Object.freeze(value) } : failure("INVALID_ARGUMENT", "The routed location reference is too long.");
    }
    function unwrap(reference: string): { sourceId: string; backend: FilesystemBackendApi; reference: string } | null {
      try {
        const parsed: unknown = JSON.parse(reference);
        if (Array.isArray(parsed) && parsed.length === 3 && parsed[0] === "lunaris-source-v1" && typeof parsed[1] === "string" && typeof parsed[2] === "string") {
          const backend = backends.get(parsed[1]);
          return backend ? { sourceId: parsed[1], backend, reference: parsed[2] } : null;
        }
      } catch { /* Legacy opaque references belong to the configured default source. */ }
      return { sourceId: defaultSource, backend: primary, reference };
    }
    const capabilities = (): FsCapabilities => {
      const all = [...backends.values()].map(backend => backend.capabilities());
      return Object.freeze({ watch: all.every(c => c.watch), atomicReplace: all.every(c => c.atomicReplace), versionCheck: "optimistic", trash: false,
        maxFileBytes: Math.min(...all.map(c => c.maxFileBytes)) });
    };
    ctx.provide(FilesystemSources, { list: () => Object.freeze([...backends.keys()]), location: wrap,
      capabilitiesFor: id => { const entry = roots.get(id); return entry ? { ok: true, value: Object.freeze({ ...entry.backend.capabilities() }) } : closed(); } });
    for (const source of bindings) {
      const backend = backends.get(source.id)!;
      ctx.events.on(source.changed, async change => {
        for (const [watchId, watch] of watches) {
          const root = roots.get(watch.rootId);
          if (root?.backend === backend && root.nativeId === change.vaultId && watch.nativeId === change.watchId && !ctx.signal.aborted) {
            await ctx.events.emit(DriverFileChanged, { ...change, vaultId: watch.rootId, watchId });
          }
        }
      });
    }
    async function watch(target: FileTarget, owner: CancellationSignal, recursive = true): Promise<FsResult<string>> {
      if (owner.aborted) return failure("CANCELLED", "Observation cancelled.");
      const result = await targetWork(target, (backend, native) => backend.watchOwned(native, owner, recursive));
      if (ctx.signal.aborted || owner.aborted || !roots.has(target.vaultId)) return failure("CANCELLED", "Observation cancelled.");
      if (!result.ok) return result;
      const id = nextId();
      const abort = () => watches.delete(id);
      watches.set(id, { rootId: target.vaultId, nativeId: result.value, detach: () => owner.removeEventListener("abort", abort) });
      owner.addEventListener("abort", abort, { once: true });
      return { ok: true, value: id };
    }
    ctx.provide(FilesystemObservationDriver, { watch });
    ctx.provide(FilesystemRootsDriver, { selectVault: owner => acquire(primary, owner, () => primary.selectOwned(owner)) });
    ctx.provide(ApplicationDirectoryDriver, { openConfig: owner => acquireRequired(primary, owner, () => primary.openConfig(owner)) });
    ctx.provide(FilesystemLocationsDriver, {
      async select(owner) { const result = await primary.selectLocation(owner); return result.ok && result.value !== null ? wrap(defaultSource, result.value) : result; },
      async describe(reference) {
        const route = unwrap(reference); if (!route) return failure("NOT_FOUND", "Filesystem source unavailable.");
        const result = await route.backend.describeLocation(route.reference);
        return result.ok ? wrap(route.sourceId, result.value) : result;
      },
      attach(location, owner) {
        const route = validFolderLocation(location) ? unwrap(location.reference) : null;
        return route ? acquireRequired(route.backend, owner, () => route.backend.attachLocation({ reference: route.reference, label: location.label }, owner)) : Promise.resolve(failure("NOT_FOUND", "Filesystem source unavailable."));
      },
    });
    ctx.provide(DirectoryLocationsDriver, { async create(parent, name, owner) {
      const route = validFolderLocation(parent) ? unwrap(parent.reference) : null;
      if (!route) return failure("NOT_FOUND", "Filesystem source unavailable.");
      const result = await route.backend.createLocation({ reference: route.reference, label: parent.label }, name, owner);
      return result.ok ? wrap(route.sourceId, result.value) : result;
    } });
    async function transfer(method: "move" | "copy", source: FileTarget, destination: FileTarget, overwrite = false): Promise<FsResult<null>> {
      if (!validTarget(destination) || source.vaultId !== destination.vaultId) return failure("INVALID_PATH", "Transfers must stay within one attachment.");
      return targetWork(source, (backend, native) => backend[method](native, { vaultId: native.vaultId, path: destination.path }, overwrite));
    }
    ctx.provide(FilesystemDriver, {
      capabilities, selectVault: () => acquire(primary, ctx.signal, () => primary.selectOwned(ctx.signal)),
      closeVault: id => rootWork(id, async entry => {
        roots.delete(id);
        let result: FsResult<null>;
        try { result = await entry.backend.closeVault(entry.nativeId); }
        catch (error) {
          if (!ctx.signal.aborted && !entry.owner.aborted) roots.set(id, entry);
          else entry.detach();
          throw error;
        }
        if (ctx.signal.aborted) return closed();
        if (!result.ok && result.error.code !== "VAULT_CLOSED" && !entry.owner.aborted) { roots.set(id, entry); return result; }
        entry.detach(); for (const [watchId, value] of watches) if (value.rootId === id) { value.detach(); watches.delete(watchId); }
        logger.info(ctx.pluginId, "Filesystem source released"); return result;
      }),
      pickFile: id => rootWork(id, entry => entry.backend.pickFile(entry.nativeId)),
      pickDirectory: id => rootWork(id, entry => entry.backend.pickDirectory(entry.nativeId)),
      pickSaveLocation: id => rootWork(id, entry => entry.backend.pickSaveLocation(entry.nativeId)),
      readText: target => targetWork(target, (backend, native) => backend.readText(native)),
      readFile: target => targetWork(target, (backend, native) => backend.readFile(native)),
      writeText: (target, text, options) => targetWork(target, (backend, native) => backend.writeText(native, text, options)),
      writeFile: (target, data, options) => targetWork(target, (backend, native) => backend.writeFile(native, data, options)),
      stat: target => targetWork(target, (backend, native) => backend.stat(native)),
      list: target => targetWork(target, (backend, native) => backend.list(native)),
      createDirectory: (target, recursive) => targetWork(target, (backend, native) => backend.createDirectory(native, recursive)),
      remove: (target, recursive) => targetWork(target, (backend, native) => backend.remove(native, recursive)),
      move: (source, destination, overwrite) => transfer("move", source, destination, overwrite),
      copy: (source, destination, overwrite) => transfer("copy", source, destination, overwrite),
      watch: (target, recursive) => watch(target, ctx.signal, recursive),
      unwatch: (id, watchId) => rootWork(id, async entry => {
        const value = watches.get(watchId); if (!value) return { ok: true, value: null };
        if (value.rootId !== id) return failure("INVALID_ARGUMENT", "The watch belongs to another attachment.");
        const result = await entry.backend.unwatch(entry.nativeId, value.nativeId); if (result.ok) { value.detach(); watches.delete(watchId); } return result;
      }),
    });
    logger.info(ctx.pluginId, "Filesystem router ready", { data: { sources: bindings.map(source => source.id) } });
  } });
}
