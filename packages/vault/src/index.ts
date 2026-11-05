import { defineApi, defineEvent, defineHook } from "@lunaris/sdk";
import type { FsFailure, VaultRoot } from "@lunaris/filesystem";

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
export interface VaultChange {
  readonly kind: "opened" | "switched" | "closed";
  readonly previous: VaultRoot | null;
  readonly current: VaultRoot | null;
}
export interface VaultPreparation {
  readonly vault: VaultRoot;
  /** Return an error to reject preparation; preserve a preceding handler's error. */
  readonly error: string | null;
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
  id: "lunaris.vault-changed", version: "1.0.0", consumePermission: "vault.access",
  validate(value) {
    if (value === null || typeof value !== "object") return false;
    const change = value as Partial<VaultChange>;
    if (change.kind === "opened") return change.previous === null && validRoot(change.current);
    if (change.kind === "closed") return validRoot(change.previous) && change.current === null;
    return change.kind === "switched" && validRoot(change.previous) && validRoot(change.current);
  },
});
export const PrepareVault = defineHook<VaultPreparation>({
  id: "lunaris.prepare-vault", version: "1.0.0", consumePermission: "vault.access",
  validate: value => {
    if (value === null || typeof value !== "object") return false;
    const preparation = value as Partial<VaultPreparation>;
    return validRoot(preparation.vault) && (preparation.error === null || typeof preparation.error === "string");
  },
});
