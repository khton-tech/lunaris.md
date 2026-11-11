import { defineApi, defineEvent, defineHook } from "@lunaris/sdk";
import { validFolderLocation } from "@lunaris/filesystem";
import type { FolderLocation, FsFailure, VaultRoot } from "@lunaris/filesystem";
import type { CancellationSignal } from "@lunaris/sdk";

export function validVaultName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200 && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
}
export interface VaultLocationsApi {
  /** Refresh the driver-owned display location without opening it. */
  describe(reference: string): Promise<VaultResult<FolderLocation>>;
  select(owner: CancellationSignal): Promise<VaultResult<FolderLocation | null>>;
  open(location: FolderLocation, options?: { readonly name?: string }): Promise<VaultResult<VaultRoot>>;
}
export const VaultLocations = defineApi<VaultLocationsApi>({
  id: "lunaris.vault-locations", version: "1.1.0", consumePermission: "vault.access",
  validate: value => value !== null && typeof value === "object" &&
    ["select", "open", "describe"].every(name => typeof Object.getOwnPropertyDescriptor(value, name)?.value === "function"),
});
/** Create a named child of the selected parent, prepare it and activate its own root. */
export const VaultCreation = defineApi<{ create(parent: FolderLocation, name: string): Promise<VaultResult<VaultRoot>> }>({
  id: "lunaris.vault-creation", version: "1.0.0", consumePermission: "vault.access",
  validate: value => value !== null && typeof value === "object" && typeof Object.getOwnPropertyDescriptor(value, "create")?.value === "function",
});
export interface RecentVault { readonly location: FolderLocation; readonly name: string }
export type VaultHistoryResult<T> = { readonly ok: true; readonly value: T } | {
  readonly ok: false; readonly error: VaultFailure | { readonly code: "HISTORY_UNAVAILABLE"; readonly message: string };
};
export interface VaultHistoryApi {
  list(): Promise<VaultHistoryResult<readonly RecentVault[]>>;
  open(reference: string): Promise<VaultHistoryResult<VaultRoot>>;
}
export function validRecentVault(value: unknown): value is RecentVault {
  if (value === null || typeof value !== "object") return false;
  const entry = value as Partial<RecentVault>;
  return validFolderLocation(entry.location) && typeof entry.name === "string" && entry.name.length > 0 && entry.name.length <= 4096;
}
export const VaultHistory = defineApi<VaultHistoryApi>({
  id: "lunaris.vault-history", version: "1.0.0", consumePermission: "vault.access",
  validate: value => value !== null && typeof value === "object" &&
    ["list", "open"].every(name => typeof Object.getOwnPropertyDescriptor(value, name)?.value === "function"),
});
/** Most-recent-first immutable snapshot, emitted after successful persistence. */
export const VaultHistoryChanged = defineEvent<{ readonly entries: readonly RecentVault[] }>({
  id: "lunaris.vault-history-changed", version: "1.0.0", consumePermission: "vault.access",
  validate: value => value !== null && typeof value === "object" &&
    Array.isArray((value as { entries?: unknown }).entries) && (value as { entries: unknown[] }).entries.every(validRecentVault),
});

export type VaultFailure = FsFailure | {
  readonly code: "BUSY" | "PREPARATION_FAILED" | "STOPPED";
  readonly message: string;
};
export type VaultResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: VaultFailure };
export interface VaultApi {
  current(): VaultRoot | null;
  /** Select and prepare a Vault, replacing the active one only after preparation succeeds. */
  open(): Promise<VaultResult<VaultRoot | null>>;
  close(): Promise<VaultResult<null>>;
}
/** Awaited while the previous root is still writable. Never recursively transition.
 * onSettled releases editor locks on success, rejection, or handler failure. */
export interface VaultRelease {
  readonly previous: VaultRoot;
  readonly next: VaultRoot | null;
  readonly error: FsFailure | null;
  readonly onSettled: (listener: () => void) => void;
}
export const BeforeVaultRelease = defineHook<VaultRelease>({
  id: "lunaris.before-vault-release", version: "1.0.0", consumePermission: "vault.access",
  validate: input => { const value = input as VaultRelease | null; return !!value && validRoot(value.previous) && (value.next === null || validRoot(value.next)) &&
    (value.error === null || typeof value.error?.code === "string") && typeof value.onSettled === "function"; },
});
export interface VaultChange {
  readonly kind: "opened" | "switched" | "closed";
  readonly previous: VaultRoot | null;
  readonly current: VaultRoot | null;
  /** Present for opens through VaultLocations; safe to persist, never log. */
  readonly location?: FolderLocation;
}
export interface VaultPreparation {
  readonly vault: VaultRoot;
  /** Return an error to reject preparation; preserve a preceding handler's error. */
  readonly error: string | null;
  /** Explicit display name requested by a creation form. */
  readonly requestedName?: string;
  /** Resolved by configuration preparation without substituting root identity. */
  readonly displayName?: string;
}
const validRoot = (value: unknown): value is VaultRoot => {
  if (value === null || typeof value !== "object") return false;
  const root = value as Partial<VaultRoot>;
  return typeof root.id === "string" && root.id.length > 0 && typeof root.name === "string";
};
export const Vault = defineApi<VaultApi>({
  id: "lunaris.vault", version: "1.0.0", consumePermission: "vault.access",
  validate: value => value !== null && typeof value === "object" &&
    ["current", "open", "close"].every(name => typeof Object.getOwnPropertyDescriptor(value, name)?.value === "function"),
});
export const VaultChanged = defineEvent<VaultChange>({
  id: "lunaris.vault-changed", version: "1.1.0", consumePermission: "vault.access",
  validate(value) {
    if (value === null || typeof value !== "object") return false;
    const change = value as Partial<VaultChange>;
    if (change.location !== undefined && (!validFolderLocation(change.location) || change.kind === "closed")) return false;
    if (change.kind === "opened") return change.previous === null && validRoot(change.current);
    if (change.kind === "closed") return validRoot(change.previous) && change.current === null;
    return change.kind === "switched" && validRoot(change.previous) && validRoot(change.current);
  },
});
export const PrepareVault = defineHook<VaultPreparation>({
  id: "lunaris.prepare-vault", version: "1.1.0", consumePermission: "vault.access",
  validate: value => {
    if (value === null || typeof value !== "object") return false;
    const preparation = value as Partial<VaultPreparation>;
    return validRoot(preparation.vault) && (preparation.error === null || typeof preparation.error === "string") &&
      (preparation.requestedName === undefined || validVaultName(preparation.requestedName)) &&
      (preparation.displayName === undefined || validVaultName(preparation.displayName));
  },
});

/** Stable Vault metadata storage namespace, retained for existing configuration files. */
export const VAULT_METADATA_NAMESPACE = "lunaris.vault-manager";

/** Awaited runtime participants; release runs only after every save guard accepts. */
export interface VaultLifecycleParticipant {
  readonly id: string;
  /** Settlement only: runtimes use 0; product preparation follows at 100. */
  readonly settlementOrder?: number;
  beforeRelease(previous: VaultRoot, next: VaultRoot | null): Promise<VaultResult<null>>;
  /** Runs under the transition lock; current may equal previous after a failed release. */
  settled(previous: VaultRoot | null, current: VaultRoot | null): Promise<void>;
}
export interface VaultLifecycleApi {
  register(participant: VaultLifecycleParticipant, owner: CancellationSignal): VaultResult<null>;
}
export const VaultLifecycle = defineApi<VaultLifecycleApi>({
  id: 'lunaris.vault-lifecycle', version: '1.1.0', consumePermission: 'vault.access',
  validate: value => !!value && typeof value === 'object' && typeof Object.getOwnPropertyDescriptor(value, 'register')?.value === 'function',
});
