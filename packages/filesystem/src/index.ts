import { defineApi, defineEvent, defineHook } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";

export type FsErrorCode = "CANCELLED" | "INVALID_PATH" | "INVALID_ARGUMENT" | "VAULT_CLOSED" | "NOT_FOUND" | "ALREADY_EXISTS" | "NOT_FILE" | "NOT_DIRECTORY" | "DIRECTORY_NOT_EMPTY" | "ACCESS_DENIED" | "CONFLICT" | "UNSUPPORTED" | "TOO_LARGE" | "INVALID_ENCODING" | "IO_ERROR" | "OFFLINE" | "SERVER_UNAVAILABLE" | "UNAUTHENTICATED" | "SESSION_EXPIRED" | "PROTOCOL_MISMATCH";
export interface FsFailure {
  readonly code: FsErrorCode;
  readonly message: string;
  /** Safe native error classification, without absolute paths or file contents. */
  readonly nativeCode?: number;
  readonly nativeKind?: string;
}
export type FsResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: FsFailure };
export interface FileTarget { readonly vaultId: string; readonly path: string }
/** Structural mutations are serialized by the provider. Hooks may flush writes.
 * Register completion before awaiting; it runs even when a later handler throws.
 * Completion must not initiate another structural mutation. */
export interface FileMutation {
  readonly operation: "move" | "copy" | "remove";
  readonly source: FileTarget;
  readonly destination: FileTarget | null;
  readonly overwrite: boolean;
  readonly error: FsFailure | null;
  readonly onSettled: (listener: (result: FsResult<null>) => void | Promise<void>) => void;
}
export const BeforeFileMutation = defineHook<FileMutation>({
  id: "lunaris.before-file-mutation", version: "1.0.0", consumePermission: "filesystem.access",
  validate: input => { const value = input as FileMutation | null; return !!value && ["move", "copy", "remove"].includes(value.operation) && validTarget(value.source) &&
    (value.destination === null || validTarget(value.destination)) && typeof value.overwrite === "boolean" &&
    (value.error === null || typeof value.error?.code === "string") && typeof value.onSettled === "function"; },
});
export interface VaultRoot { readonly id: string; readonly name: string }
/** Durable driver-owned reference, not a path or an attached root ID. */
export interface FolderLocation { readonly reference: string; readonly label: string }
export function validFolderLocation(value: unknown): value is FolderLocation {
  if (value === null || typeof value !== "object") return false;
  const item = value as Partial<FolderLocation>;
  return typeof item.reference === "string" && item.reference.length > 0 && item.reference.length <= 512 &&
    typeof item.label === "string" && item.label.length > 0 && item.label.length <= 4096;
}
export interface FilesystemLocationsApi {
  /** Refresh display location without attaching or preparing a Vault. */
  describe(reference: string): Promise<FsResult<FolderLocation>>;
  /** Select without attaching a root or preparing Vault files. Cancellation is successful null. */
  select(owner: CancellationSignal): Promise<FsResult<FolderLocation | null>>;
  attach(location: FolderLocation, owner: CancellationSignal): Promise<FsResult<VaultRoot>>;
}
export function validDirectoryName(value: unknown): value is string {
  return typeof value === "string" && value.length <= 200 && value === value.trim() && !value.includes("/") && validPath(value);
}
export interface DirectoryLocationsApi {
  /** Exclusively create a direct child and return its durable location; never reuse an existing directory. */
  create(parent: FolderLocation, name: string, owner: CancellationSignal): Promise<FsResult<FolderLocation>>;
}
const validDirectoryLocations = (value: unknown): boolean => value !== null && typeof value === "object" &&
  typeof Object.getOwnPropertyDescriptor(value, "create")?.value === "function";
export const DirectoryLocations = defineApi<DirectoryLocationsApi>({ id: "lunaris.directory-locations", version: "1.0.0", consumePermission: "filesystem.access", validate: validDirectoryLocations });
export const DirectoryLocationsDriver = defineApi<DirectoryLocationsApi>({ id: "lunaris.directory-locations-driver", version: "1.0.0", providePermission: "filesystem.native", consumePermission: "filesystem.access", validate: validDirectoryLocations });
const validLocationsApi = (value: unknown): boolean => value !== null && typeof value === "object" &&
  ["select", "attach", "describe"].every(name => typeof Object.getOwnPropertyDescriptor(value, name)?.value === "function");
export const FilesystemLocations = defineApi<FilesystemLocationsApi>({
  id: "lunaris.filesystem-locations", version: "1.1.0", consumePermission: "filesystem.access", validate: validLocationsApi,
});
export const FilesystemLocationsDriver = defineApi<FilesystemLocationsApi>({
  id: "lunaris.filesystem-locations-driver", version: "1.1.0", providePermission: "filesystem.native", consumePermission: "filesystem.access", validate: validLocationsApi,
});
export interface FileInfo { readonly path: string; readonly kind: "file" | "directory" | "symlink" | "other"; readonly size: number; readonly modifiedAt: number | null }
export interface TextFile { readonly text: string; readonly version: string }
export interface BinaryFile { readonly data: readonly number[]; readonly version: string }
export type WriteOptions = { readonly mode: "create"; readonly expectedVersion?: never } | {
  readonly mode: "replace" | "upsert";
  /** Optimistic version check; external processes do not participate in the driver's lock. */
  readonly expectedVersion?: string;
};
export interface WriteReceipt { readonly version: string }
export interface FsCapabilities {
  readonly watch: boolean;
  readonly atomicReplace: boolean;
  readonly versionCheck: "optimistic";
  readonly trash: false;
  readonly maxFileBytes: number;
}
export interface FileChange {
  readonly vaultId: string;
  readonly watchId: string;
  readonly kind: "created" | "modified" | "removed" | "renamed" | "rescan";
  readonly paths: readonly string[];
}
export interface FilesystemApi {
  capabilities(): FsCapabilities;
  selectVault(): Promise<FsResult<VaultRoot | null>>;
  closeVault(vaultId: string): Promise<FsResult<null>>;
  pickFile(vaultId: string): Promise<FsResult<string | null>>;
  pickDirectory(vaultId: string): Promise<FsResult<string | null>>;
  pickSaveLocation(vaultId: string): Promise<FsResult<string | null>>;
  readText(target: FileTarget): Promise<FsResult<TextFile>>;
  readFile(target: FileTarget): Promise<FsResult<BinaryFile>>;
  writeText(target: FileTarget, text: string, options: WriteOptions): Promise<FsResult<WriteReceipt>>;
  writeFile(target: FileTarget, data: readonly number[], options: WriteOptions): Promise<FsResult<WriteReceipt>>;
  stat(target: FileTarget): Promise<FsResult<FileInfo>>;
  list(target: FileTarget): Promise<FsResult<readonly FileInfo[]>>;
  createDirectory(target: FileTarget, recursive?: boolean): Promise<FsResult<null>>;
  remove(target: FileTarget, recursive?: boolean): Promise<FsResult<null>>;
  move(source: FileTarget, destination: FileTarget, overwrite?: boolean): Promise<FsResult<null>>;
  copy(source: FileTarget, destination: FileTarget, overwrite?: boolean): Promise<FsResult<null>>;
  watch(target: FileTarget, recursive?: boolean): Promise<FsResult<string>>;
  unwatch(vaultId: string, watchId: string): Promise<FsResult<null>>;
}

export const filesystemMethods = Object.freeze([
  "capabilities", "selectVault", "closeVault", "pickFile", "pickDirectory", "pickSaveLocation", "readText", "readFile",
  "writeText", "writeFile", "stat", "list", "createDirectory", "remove", "move", "copy", "watch", "unwatch",
] as const);
const validateApi = (value: unknown): boolean => value !== null && typeof value === "object" &&
  filesystemMethods.every(name => typeof Object.getOwnPropertyDescriptor(value, name)?.value === "function");
export const Filesystem = defineApi<FilesystemApi>({ id: "lunaris.filesystem", version: "1.0.0", consumePermission: "filesystem.access", validate: validateApi });
/** Provider-owned observation: cancellation releases the watch using the provider's live scope. */
export interface FilesystemObservationApi {
  watch(target: FileTarget, owner: CancellationSignal, recursive?: boolean): Promise<FsResult<string>>;
}
export const FilesystemObservation = defineApi<FilesystemObservationApi>({
  id: "lunaris.filesystem-observation", version: "1.0.0", consumePermission: "filesystem.access",
  validate: value => value !== null && typeof value === "object" &&
    typeof Object.getOwnPropertyDescriptor(value, "watch")?.value === "function",
});
/** Bind native observations to the provider activation, including provider-only restarts. */
export const FilesystemObservationDriver = defineApi<FilesystemObservationApi>({
  id: "lunaris.filesystem-observation-driver", version: "1.0.0", providePermission: "filesystem.native", consumePermission: "filesystem.access",
  validate: value => value !== null && typeof value === "object" &&
    typeof Object.getOwnPropertyDescriptor(value, "watch")?.value === "function",
});
export const FilesystemDriver = defineApi<FilesystemApi>({ id: "lunaris.filesystem-driver", version: "1.0.0", providePermission: "filesystem.native", consumePermission: "filesystem.access", validate: validateApi });

/** Roots are opaque capabilities; FileTarget.vaultId also accepts an application root ID. */
export interface FilesystemRootsApi {
  selectVault(owner: CancellationSignal): Promise<FsResult<VaultRoot | null>>;
}
export const FilesystemRoots = defineApi<FilesystemRootsApi>({
  id: "lunaris.filesystem-roots", version: "1.0.0", consumePermission: "filesystem.access",
  validate: value => value !== null && typeof value === "object" &&
    typeof Object.getOwnPropertyDescriptor(value, "selectVault")?.value === "function",
});
export const ApplicationDirectory = defineApi<{ openConfig(owner: CancellationSignal): Promise<FsResult<VaultRoot>> }>({
  id: "lunaris.application-directory", version: "1.0.0", consumePermission: "filesystem.app-config",
  validate: value => value !== null && typeof value === "object" &&
    typeof Object.getOwnPropertyDescriptor(value, "openConfig")?.value === "function",
});
export const FilesystemRootsDriver = defineApi<FilesystemRootsApi>({
  id: "lunaris.filesystem-roots-driver", version: "1.0.0",
  providePermission: "filesystem.native", consumePermission: "filesystem.access",
  validate: value => value !== null && typeof value === "object" &&
    typeof Object.getOwnPropertyDescriptor(value, "selectVault")?.value === "function",
});
export const ApplicationDirectoryDriver = defineApi<{ openConfig(owner: CancellationSignal): Promise<FsResult<VaultRoot>> }>({
  id: "lunaris.application-directory-driver", version: "1.0.0",
  providePermission: "filesystem.native", consumePermission: "filesystem.app-config",
  validate: value => value !== null && typeof value === "object" &&
    typeof Object.getOwnPropertyDescriptor(value, "openConfig")?.value === "function",
});
function validChange(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const change = value as Partial<FileChange>;
  return typeof change.vaultId === "string" && change.vaultId.length > 0 && typeof change.watchId === "string" && change.watchId.length > 0 &&
    typeof change.kind === "string" && ["created", "modified", "removed", "renamed", "rescan"].includes(change.kind) &&
    Array.isArray(change.paths) && change.paths.every(path => validPath(path, true));
}
export const FileChanged = defineEvent<FileChange>({ id: "lunaris.filesystem-changed", version: "1.0.0", consumePermission: "filesystem.access", validate: validChange });
export const DriverFileChanged = defineEvent<FileChange>({ id: "lunaris.filesystem-driver-changed", version: "1.0.0", providePermission: "filesystem.native", consumePermission: "filesystem.access", validate: validChange });

export function failure(code: FsErrorCode, message: string): FsResult<never> { return { ok: false, error: { code, message } }; }

/** Canonical portable relative paths. Empty string denotes the Vault root. */
export function validPath(path: unknown, allowRoot = false): path is string {
  if (typeof path !== "string") return false;
  if (path === "") return allowRoot;
  return path.split("/").every(part => part !== "" && part !== "." && part !== ".." &&
    !/[\\:*?"<>|\u0000-\u001f\u007f]/.test(part) && !/[. ]$/.test(part) &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}

export function validTarget(target: FileTarget, allowRoot = false): boolean {
  return target !== null && typeof target === "object" && typeof target.vaultId === "string" && target.vaultId.length > 0 && validPath(target.path, allowRoot);
}

export * from "./sources.js";

