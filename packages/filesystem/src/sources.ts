import { defineApi, defineEvent } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";
import type { FileChange, FileTarget, FilesystemApi, FolderLocation, FsCapabilities, FsResult, VaultRoot } from "./index.js";
import { validPath } from "./index.js";

/** Flat methods retain SDK mediation; implementations never escape in results. */
export interface FilesystemBackendApi extends FilesystemApi {
  remoteIdentity(rootId: string): FsResult<RemoteRootIdentity>;
  openConfig(owner: CancellationSignal): Promise<FsResult<VaultRoot>>;
  selectOwned(owner: CancellationSignal): Promise<FsResult<VaultRoot | null>>;
  describeLocation(reference: string): Promise<FsResult<FolderLocation>>;
  selectLocation(owner: CancellationSignal): Promise<FsResult<FolderLocation | null>>;
  attachLocation(location: FolderLocation, owner: CancellationSignal): Promise<FsResult<VaultRoot>>;
  createLocation(parent: FolderLocation, name: string, owner: CancellationSignal): Promise<FsResult<FolderLocation>>;
  watchOwned(target: FileTarget, owner: CancellationSignal, recursive?: boolean): Promise<FsResult<string>>;
}

export const backendMethods = Object.freeze([
  "remoteIdentity",
  "capabilities", "selectVault", "closeVault", "pickFile", "pickDirectory", "pickSaveLocation",
  "readText", "readFile", "writeText", "writeFile", "stat", "list", "createDirectory", "remove",
  "move", "copy", "watch", "unwatch", "openConfig", "selectOwned", "describeLocation",
  "selectLocation", "attachLocation", "createLocation", "watchOwned",
] as const);

/** The host chooses tokens; source identity is never inferred from a plugin ID. */
export function defineFilesystemBackend(id: string) {
  return Object.freeze({
    api: defineApi<FilesystemBackendApi>({ id, version: "1.0.0", providePermission: "filesystem.native", consumePermission: "filesystem.access",
      validate: value => value !== null && typeof value === "object" && backendMethods.every(method => typeof Object.getOwnPropertyDescriptor(value, method)?.value === "function") }),
    changed: defineEvent<FileChange>({ id: `${id}-changed`, version: "1.0.0", providePermission: "filesystem.native", consumePermission: "filesystem.access",
      validate: value => { const v = value as FileChange | null; return !!v && typeof v.vaultId === "string" && typeof v.watchId === "string" &&
        ["created", "modified", "removed", "renamed", "rescan"].includes(v.kind) && Array.isArray(v.paths) && v.paths.every(path => validPath(path, true)); } }),
  });
}

export const LocalFilesystemBackend = defineFilesystemBackend("lunaris.local-filesystem-backend");
export const RemoteFilesystemBackend = defineFilesystemBackend("lunaris.remote-filesystem-backend");

export interface FilesystemSourcesApi {
  list(): readonly string[];
  /** Wrap a durable backend reference for VaultLocations; labels grant no access. */
  location(sourceId: string, location: FolderLocation): FsResult<FolderLocation>;
  capabilitiesFor(rootId: string): FsResult<FsCapabilities>;
  remoteIdentity(rootId: string): FsResult<RemoteRootIdentity>;
}
export interface RemoteRootIdentity { readonly server: string; readonly accountId: string; readonly vaultId: string }
export const FilesystemSources = defineApi<FilesystemSourcesApi>({ id: "lunaris.filesystem-sources", version: "1.0.0", consumePermission: "filesystem.access",
  validate: value => value !== null && typeof value === "object" && ["list", "location", "capabilitiesFor", "remoteIdentity"].every(method => typeof Object.getOwnPropertyDescriptor(value, method)?.value === "function") });
