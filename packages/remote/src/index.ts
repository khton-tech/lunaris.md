import { defineApi, defineEvent } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";
import type { FolderLocation, FsFailure, FsResult } from "@lunaris/filesystem";
import { validFolderLocation } from "@lunaris/filesystem";

export const REMOTE_PROTOCOL = 1;
/** Durable remote authority includes the exact selected origin and account reference. */
export function encodeRemoteReference(server: string, reference: string): string { return JSON.stringify(["lunaris-remote-v1", server, reference]); }
export function decodeRemoteReference(reference: string): { readonly server: string; readonly reference: string } | null {
  try { const value: unknown = JSON.parse(reference); return Array.isArray(value) && value.length === 3 && value[0] === "lunaris-remote-v1" && typeof value[1] === "string" && !!value[1] && typeof value[2] === "string" && !!value[2] ? { server: value[1], reference: value[2] } : null; }
  catch { return null; }
}
/** Protocol v1 conservative content ceiling and encoded file-request admission limit, in bytes. */
export const REMOTE_FILE_LIMITS = Object.freeze({ maxFileBytes: 1024 * 1024, maxRequestBytes: 16 * 1024 * 1024 });
function utf8Bytes(text: string): number { let bytes = 0; for (const char of text) { const code = char.codePointAt(0)!; bytes += code > 0xffff ? 4 : code > 0x7ff ? 3 : code > 0x7f ? 2 : 1; if (bytes > REMOTE_FILE_LIMITS.maxFileBytes) break; } return bytes; }
export function remoteFileContentFits(operation: string, args: { readonly text?: unknown; readonly data?: unknown }): boolean {
  if (operation === "writeText" && typeof args.text === "string") return args.text.length <= REMOTE_FILE_LIMITS.maxFileBytes && utf8Bytes(args.text) <= REMOTE_FILE_LIMITS.maxFileBytes;
  if (operation === "writeFile" && Array.isArray(args.data)) return args.data.length <= REMOTE_FILE_LIMITS.maxFileBytes;
  return true;
}
export interface ServerInfo { readonly name?: string; readonly description?: string; readonly limits?: Readonly<typeof REMOTE_FILE_LIMITS>; readonly protocol: number; readonly buildId: string; readonly registration: "open" | "invitation" }
export interface Account { readonly id: string; readonly login: string }
export interface AccountState { readonly server: string; readonly account: Account; readonly epoch: string }
export type RemoteFailure = FsFailure | { readonly code: "LIMIT_REACHED" | "INVALID_CREDENTIALS" | "INVITATION_REQUIRED" | "INVITATION_INVALID" | "LOGIN_TAKEN" | "BUSY" | "PREPARATION_FAILED" | "STOPPED"; readonly message: string };
export type RemoteResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: RemoteFailure };
export interface AccountSessionApi {
  current(): AccountState | null;
  connect(address: string, owner: CancellationSignal): Promise<RemoteResult<ServerInfo>>;
  register(login: string, password: string, invitation?: string): Promise<RemoteResult<Account>>;
  login(login: string, password: string): Promise<RemoteResult<Account>>;
  logout(): Promise<RemoteResult<null>>;
}
/** Only trusted account/filesystem providers receive general protocol access. */
export interface ServerTransportApi extends AccountSessionApi {
  request(method: "GET" | "POST", path: string, body?: unknown, owner?: CancellationSignal): Promise<RemoteResult<unknown>>;
}
export const ServerTransport = defineApi<ServerTransportApi>({ id: "lunaris.server-transport", version: "1.0.0", consumePermission: "account.network",
  validate: value => value !== null && typeof value === "object" && ["current", "connect", "register", "login", "logout", "request"].every(method => typeof Object.getOwnPropertyDescriptor(value, method)?.value === "function") });
export interface AccountAccessApi { visible(): boolean; open(): void; close(): void }
export const AccountAccess = defineApi<AccountAccessApi>({ id: "lunaris.account-access", version: "1.0.0", consumePermission: "account.access",
  validate: value => value !== null && typeof value === "object" && ["visible", "open", "close"].every(method => typeof Object.getOwnPropertyDescriptor(value, method)?.value === "function") });
export const AccountAccessChanged = defineEvent<{ readonly visible: boolean }>({ id: "lunaris.account-access-changed", version: "1.0.0", consumePermission: "account.access",
  validate: value => typeof (value as { visible?: unknown } | null)?.visible === "boolean" });
export interface ClientUpdatesApi { available(): string | null; check(): Promise<RemoteResult<string | null>> }
export const ClientUpdates = defineApi<ClientUpdatesApi>({ id: "lunaris.client-updates", version: "1.0.0", consumePermission: "application.update",
  validate: value => value !== null && typeof value === "object" && ["available", "check"].every(method => typeof Object.getOwnPropertyDescriptor(value, method)?.value === "function") });
export const ClientUpdateChanged = defineEvent<{ readonly buildId: string | null }>({ id: "lunaris.client-update-changed", version: "1.0.0", consumePermission: "application.update",
  validate: value => !!value && ((value as { buildId?: unknown }).buildId === null || typeof (value as { buildId?: unknown }).buildId === "string") });
export const ApplicationReload = defineApi<{ reload(): void }>({ id: "lunaris.application-reload", version: "1.0.0", providePermission: "application.native", consumePermission: "application.reload",
  validate: value => value !== null && typeof value === "object" && typeof Object.getOwnPropertyDescriptor(value, "reload")?.value === "function" });
export interface RemoteVault {
  readonly id: string;
  readonly name: string;
  readonly state: "active" | "trashed";
  readonly deletedAt: number | null;
  readonly expiresAt: number | null;
  readonly location: FolderLocation;
}
export function validRemoteVault(input: unknown): input is RemoteVault {
  const value = input as RemoteVault | null;
  return !!value && typeof value.id === "string" && value.id.length > 0 && typeof value.name === "string" && value.name.length > 0 &&
    validFolderLocation(value.location) && ((value.state === "active" && value.deletedAt === null && value.expiresAt === null) ||
      (value.state === "trashed" && Number.isSafeInteger(value.deletedAt) && Number.isSafeInteger(value.expiresAt)));
}
export interface AccountVaultsApi {
  list(state?: "active" | "trashed"): Promise<RemoteResult<readonly RemoteVault[]>>;
  create(name: string): Promise<RemoteResult<RemoteVault>>;
  trash(vaultId: string): Promise<RemoteResult<null>>;
  restore(vaultId: string): Promise<RemoteResult<RemoteVault>>;
}
/** Stable identities, never a transient attached root ID. */
export interface DraftKey { readonly writerId?: string; readonly server: string; readonly accountId: string; readonly vaultId: string; readonly path: string }
export interface DraftRecord { readonly key: DraftKey; readonly text: string; readonly expectedVersion: string; readonly revision: string; readonly updatedAt: number }
export type DraftWriteRecord = DraftRecord & { readonly key: DraftKey & { readonly writerId: string } };
export interface DraftsApi {
  /** Enumerate every writer and legacy recovery candidate without choosing one. */
  list(key: DraftKey): Promise<FsResult<readonly DraftRecord[]>>;
  load(key: DraftKey): Promise<FsResult<DraftRecord | null>>;
  save(record: DraftWriteRecord): Promise<FsResult<null>>;
  /** Remove only this acknowledged revision; a newer draft must survive. */
  remove(key: DraftKey, revision: string): Promise<FsResult<null>>;
}
const methods = (names: readonly string[]) => (value: unknown): boolean => value !== null && typeof value === "object" &&
  names.every(name => typeof Object.getOwnPropertyDescriptor(value, name)?.value === "function");
export const AccountSession = defineApi<AccountSessionApi>({ id: "lunaris.account-session", version: "1.0.0", consumePermission: "account.access", validate: methods(["current", "connect", "register", "login", "logout"]) });
export const AccountVaults = defineApi<AccountVaultsApi>({ id: "lunaris.account-vaults", version: "1.0.0", consumePermission: "account.access", validate: methods(["list", "create", "trash", "restore"]) });
export const Drafts = defineApi<DraftsApi>({ id: "lunaris.drafts", version: "2.0.0", consumePermission: "drafts.access", validate: methods(["list", "load", "save", "remove"]) });
export const DraftStorage = defineApi<DraftsApi>({ id: "lunaris.draft-storage", version: "2.0.0", providePermission: "drafts.storage", consumePermission: "drafts.access", validate: methods(["load", "save", "remove"]) });
export const AccountSessionChanged = defineEvent<{ readonly current: AccountState | null }>({ id: "lunaris.account-session-changed", version: "1.0.0", consumePermission: "account.access",
  validate: input => { const v = input as { current?: AccountState | null } | null; return !!v && (v.current === null || (!!v.current && typeof v.current.server === "string" && typeof v.current.epoch === "string" && typeof v.current.account?.id === "string" && typeof v.current.account.login === "string")); } });
export const ConnectionChanged = defineEvent<{ readonly state: "connected" | "offline" | "expired"; readonly epoch: string }>({ id: "lunaris.connection-changed", version: "1.0.0", consumePermission: "account.access",
  validate: input => { const v = input as { state?: string; epoch?: string } | null; return !!v && ["connected", "offline", "expired"].includes(v.state ?? "") && typeof v.epoch === "string"; } });

/** Last observed request outcome, not a promise of live reachability. */
export interface ConnectionSnapshot {
  readonly server: string;
  readonly epoch: string;
  readonly state: "connected" | "offline" | "expired" | "unknown";
}
export const ConnectionStatus = defineApi<{ current(): Readonly<ConnectionSnapshot> | null }>({
  id: "lunaris.connection-status", version: "1.0.0", consumePermission: "account.access", validate: methods(["current"]),
});
