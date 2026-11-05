import { defineApi, defineEvent } from "@lunaris/sdk";

export type FsErrorCode = "INVALID_PATH" | "INVALID_ARGUMENT" | "VAULT_CLOSED" | "NOT_FOUND" | "ALREADY_EXISTS" | "NOT_FILE" | "NOT_DIRECTORY" | "DIRECTORY_NOT_EMPTY" | "ACCESS_DENIED" | "CONFLICT" | "UNSUPPORTED" | "TOO_LARGE" | "INVALID_ENCODING" | "IO_ERROR";
export interface FsFailure {
  readonly code: FsErrorCode;
  readonly message: string;
  /** Safe native error classification, without absolute paths or file contents. */
  readonly nativeCode?: number;
  readonly nativeKind?: string;
}
export type FsResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: FsFailure };
export interface FileTarget { readonly vaultId: string; readonly path: string }
export interface VaultRoot { readonly id: string; readonly name: string }
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
export const FilesystemDriver = defineApi<FilesystemApi>({ id: "lunaris.filesystem-driver", version: "1.0.0", providePermission: "filesystem.native", consumePermission: "filesystem.access", validate: validateApi });
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

