import { definePlugin } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { DraftStorage } from "@lunaris/remote";
import type { DraftKey, DraftRecord } from "@lunaris/remote";
import { LocalFilesystemBackend, failure, validTarget } from "@lunaris/filesystem";
import type { FileTarget, FsResult, WriteOptions } from "@lunaris/filesystem";
import { sha256 } from "@noble/hashes/sha2.js";

interface StoredFile { readonly data: readonly number[]; readonly version: string; readonly modifiedAt: number }
const keyOf = (key: DraftKey) => JSON.stringify([key.server, key.accountId, key.vaultId, key.path, ...(key.writerId ? [key.writerId] : [])]);
export function createBrowserStorage(options: { readonly databaseName?: string; readonly indexedDB?: IDBFactory; readonly config?: boolean } = {}) {
  return definePlugin({ manifest: { manifestVersion: 1, id: "lunaris.browser-storage", version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./dist/index.js",
    provides: [DraftStorage, ...(options.config === false ? [] : [LocalFilesystemBackend.api, LocalFilesystemBackend.changed])].map(t => ({ kind: t.kind, id: t.id, version: t.version })),
    requires: [{ kind: Logger.kind, id: Logger.id, range: "^1.0.0" }], permissions: ["drafts.storage", ...(options.config === false ? [] : ["filesystem.native"])], optionalPermissions: [] }, async activate(ctx) {
    const logger = scopeLogger(ctx.use(Logger), ctx.signal); const factory = options.indexedDB ?? globalThis.indexedDB;
    if (!factory) throw Error("Persistent browser storage is unavailable.");
    let closed = false; let database: IDBDatabase | undefined;
    const roots = new Map<string, () => void>(); let sequence = 0;
    ctx.scope.own({ dispose() { closed = true; for (const detach of roots.values()) detach(); roots.clear(); database?.close(); } });
    database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(options.databaseName ?? "lunaris-device-v1", 2);
      request.onupgradeneeded = () => { for (const name of ["files", "drafts", "draft-writers"]) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name); };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(Error("Close other Lunaris tabs to upgrade local storage."));
      request.onsuccess = () => { if (closed) { request.result.close(); reject(Error("Browser storage stopped.")); } else resolve(request.result); };
    });
    database.onversionchange = () => { database?.close(); if (!ctx.signal.aborted) logger.warn(ctx.pluginId, "Local storage requires a page reload"); };
    ctx.signal.throwIfAborted();
    function access<T>(storeName: string, key: string, change?: (previous: T | undefined, store: IDBObjectStore) => T | undefined): Promise<T | undefined> {
      return new Promise((resolve, reject) => {
        if (closed) return reject(Error("Browser storage is closed."));
        const tx = database!.transaction(storeName, change ? "readwrite" : "readonly"); const store = tx.objectStore(storeName); const request = store.get(key); let value: T | undefined; let original: unknown;
        request.onsuccess = () => { try { value = change ? change(request.result as T | undefined, store) : request.result as T | undefined; } catch (error) { original = error; tx.abort(); } };
        tx.oncomplete = () => resolve(value); tx.onerror = () => {}; tx.onabort = () => reject(original ?? tx.error ?? Error("Storage transaction aborted."));
      });
    }
    async function result<T>(work: () => Promise<T>): Promise<FsResult<T>> {
      try { return { ok: true, value: await work() }; }
      catch (error) { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Device storage operation failed", { error }); return failure("IO_ERROR", "Local storage is unavailable or full."); }
    }
    async function candidates(key: DraftKey): Promise<readonly DraftRecord[]> {
      const records = await new Promise<DraftRecord[]>((resolve, reject) => {
        const tx = database!.transaction(["drafts", "draft-writers"], "readonly");
        const legacy = tx.objectStore("drafts").getAll(); const writers = tx.objectStore("draft-writers").getAll();
        tx.oncomplete = () => resolve([...legacy.result, ...writers.result] as DraftRecord[]);
        tx.onabort = () => reject(tx.error); tx.onerror = () => {};
      });
      return records.filter(record => record.key.server === key.server && record.key.accountId === key.accountId && record.key.vaultId === key.vaultId && record.key.path === key.path);
    }
    ctx.provide(DraftStorage, {
      list: key => result(() => candidates(key)),
      load: key => result(async () => (await access<DraftRecord>(key.writerId ? "draft-writers" : "drafts", keyOf(key))) ?? null),
      save: record => typeof record.key.writerId !== "string" || !record.key.writerId ? Promise.resolve(failure("INVALID_ARGUMENT", "A writer identity is required.")) : result(async () => { await access<DraftRecord>("draft-writers", keyOf(record.key), (_previous, store) => { store.put({ ...record, key: { ...record.key } }, keyOf(record.key)); return record; }); return null; }),
      remove: (key, revision) => result(async () => { await access<DraftRecord>(key.writerId ? "draft-writers" : "drafts", keyOf(key), (previous, store) => { if (previous?.revision === revision) { store.delete(keyOf(key)); return undefined; } return previous; }); return null; }),
    });
    if (options.config !== false) {
      const unsupported = () => Promise.resolve(failure("UNSUPPORTED", "Browser storage only owns device configuration; use server Vaults."));
      function valid(target: FileTarget) { return validTarget(target) && roots.has(target.vaultId); }
      async function read(target: FileTarget): Promise<FsResult<StoredFile>> {
        if (!valid(target)) return failure("VAULT_CLOSED", "The device configuration attachment is closed.");
        const loaded = await result(() => access<StoredFile>("files", target.path));
        return loaded.ok && loaded.value === undefined ? failure("NOT_FOUND", "Configuration file not found.") : loaded as FsResult<StoredFile>;
      }
      async function write(target: FileTarget, data: readonly number[], options: WriteOptions): Promise<FsResult<{ version: string }>> {
        if (!valid(target)) return failure("VAULT_CLOSED", "The device configuration attachment is closed.");
        if (!options || !["create", "replace", "upsert"].includes(options.mode) || (options.mode === "create" && options.expectedVersion !== undefined)) return failure("INVALID_ARGUMENT", "An explicit write mode is required.");
        if (closed || !roots.has(target.vaultId)) return failure("VAULT_CLOSED", "The configuration attachment closed.");
        let declined: FsResult<never> | undefined;
        const saved = await result(async () => {
          // Content versions must also work on HTTP origins without Web Crypto.
          const version = [...sha256(new Uint8Array(data))].map(byte => byte.toString(16).padStart(2, "0")).join("");
          await access<StoredFile>("files", target.path, (previous, store) => {
            if (options.mode === "create" && previous) declined = failure("ALREADY_EXISTS", "The configuration already exists.");
            else if (options.mode === "replace" && !previous) declined = failure("NOT_FOUND", "The configuration no longer exists.");
            else if (options.expectedVersion !== undefined && previous?.version !== options.expectedVersion) declined = failure("CONFLICT", "The configuration changed in another tab.");
            if (declined) return previous;
            const record = { data: [...data], version, modifiedAt: Date.now() }; store.put(record, target.path); return record;
          }); return { version };
        }); return declined ?? saved;
      }
      ctx.provide(LocalFilesystemBackend.api, {
        locationVisible: () => false,
        capabilities: () => Object.freeze({ watch: false, atomicReplace: true, versionCheck: "optimistic", trash: false, maxFileBytes: Number.MAX_SAFE_INTEGER }),
        remoteIdentity: () => failure("UNSUPPORTED", "Device configuration has no remote identity."),
        async openConfig(owner) {
          if (owner.aborted || closed) return failure("CANCELLED", "Configuration attachment cancelled.");
          const id = `${ctx.activationId}:${++sequence}`; const abort = () => { roots.get(id)?.(); roots.delete(id); };
          roots.set(id, () => owner.removeEventListener("abort", abort)); owner.addEventListener("abort", abort, { once: true }); return { ok: true, value: { id, name: "Device configuration" } };
        },
        async closeVault(id) { roots.get(id)?.(); roots.delete(id); return { ok: true, value: null }; },
        async readText(target) { const loaded = await read(target); if (!loaded.ok) return loaded; try { return { ok: true, value: { text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(new Uint8Array(loaded.value.data)), version: loaded.value.version } }; } catch { return failure("INVALID_ENCODING", "Invalid UTF-8 configuration."); } },
        async readFile(target) { const loaded = await read(target); return loaded.ok ? { ok: true, value: { data: loaded.value.data, version: loaded.value.version } } : loaded; },
        writeText: (target, text, options) => write(target, [...new TextEncoder().encode(text)], options),
        writeFile: write,
        async stat(target) { if (target.path === "" && roots.has(target.vaultId)) return { ok: true, value: { path: "", kind: "directory", size: 0, modifiedAt: null } }; const loaded = await read(target); return loaded.ok ? { ok: true, value: { path: target.path, kind: "file", size: loaded.value.data.length, modifiedAt: loaded.value.modifiedAt } } : loaded; },
        list: unsupported, createDirectory: unsupported, remove: unsupported, move: unsupported, copy: unsupported,
        selectVault: unsupported, selectOwned: unsupported, describeLocation: unsupported, selectLocation: unsupported, attachLocation: unsupported, createLocation: unsupported,
        pickFile: unsupported, pickDirectory: unsupported, pickSaveLocation: unsupported, watch: unsupported, watchOwned: unsupported, unwatch: unsupported,
      });
    }
    logger.info(ctx.pluginId, "Persistent device storage ready");
  } });
}
