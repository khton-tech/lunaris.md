import { defineApi, defineEvent } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";
import type { FolderLocation, FsFailure, FsResult } from "@lunaris/filesystem";

export const REMOTE_PROTOCOL = 1;
export interface ServerInfo { readonly protocol: number; readonly buildId: string; readonly registration: "open" | "invitation" }
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
export interface RemoteVault {
  readonly id: string;
  readonly name: string;
  readonly state: "active" | "trashed";
  readonly deletedAt: number | null;
  readonly expiresAt: number | null;
  readonly location: FolderLocation;
}
export interface AccountVaultsApi {
  list(state?: "active" | "trashed"): Promise<RemoteResult<readonly RemoteVault[]>>;
  create(name: string): Promise<RemoteResult<RemoteVault>>;
  trash(vaultId: string): Promise<RemoteResult<null>>;
  restore(vaultId: string): Promise<RemoteResult<RemoteVault>>;
}
/** Stable identities, never a transient attached root ID. */
export interface DraftKey { readonly server: string; readonly accountId: string; readonly vaultId: string; readonly path: string }
export interface DraftRecord { readonly key: DraftKey; readonly text: string; readonly expectedVersion: string; readonly revision: string; readonly updatedAt: number }
export interface DraftsApi {
  load(key: DraftKey): Promise<FsResult<DraftRecord | null>>;
  save(record: DraftRecord): Promise<FsResult<null>>;
  /** Remove only this acknowledged revision; a newer draft must survive. */
  remove(key: DraftKey, revision: string): Promise<FsResult<null>>;
}
const methods = (names: readonly string[]) => (value: unknown): boolean => value !== null && typeof value === "object" &&
  names.every(name => typeof Object.getOwnPropertyDescriptor(value, name)?.value === "function");
export const AccountSession = defineApi<AccountSessionApi>({ id: "lunaris.account-session", version: "1.0.0", consumePermission: "account.access", validate: methods(["current", "connect", "register", "login", "logout"]) });
export const AccountVaults = defineApi<AccountVaultsApi>({ id: "lunaris.account-vaults", version: "1.0.0", consumePermission: "account.access", validate: methods(["list", "create", "trash", "restore"]) });
export const Drafts = defineApi<DraftsApi>({ id: "lunaris.drafts", version: "1.0.0", consumePermission: "drafts.access", validate: methods(["load", "save", "remove"]) });
export const DraftStorage = defineApi<DraftsApi>({ id: "lunaris.draft-storage", version: "1.0.0", providePermission: "drafts.storage", consumePermission: "drafts.access", validate: methods(["load", "save", "remove"]) });
export const AccountSessionChanged = defineEvent<{ readonly current: AccountState | null }>({ id: "lunaris.account-session-changed", version: "1.0.0", consumePermission: "account.access",
  validate: input => { const v = input as { current?: AccountState | null } | null; return !!v && (v.current === null || (!!v.current && typeof v.current.server === "string" && typeof v.current.epoch === "string" && typeof v.current.account?.id === "string" && typeof v.current.account.login === "string")); } });
export const ConnectionChanged = defineEvent<{ readonly state: "connected" | "offline" | "expired"; readonly epoch: string }>({ id: "lunaris.connection-changed", version: "1.0.0", consumePermission: "account.access",
  validate: input => { const v = input as { state?: string; epoch?: string } | null; return !!v && ["connected", "offline", "expired"].includes(v.state ?? "") && typeof v.epoch === "string"; } });
