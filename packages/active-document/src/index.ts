import { defineApi, defineEvent, defineHook } from "@lunaris/sdk";
import { validPath } from "@lunaris/filesystem";
import type { FileTarget, FsResult, FsFailure } from "@lunaris/filesystem";
export type ActiveDocumentState = Readonly<FileTarget> | null;
export interface DocumentTransition {
  readonly previous: ActiveDocumentState;
  readonly current: ActiveDocumentState;
  readonly reason: "open" | "close" | "restore" | "relocate" | "reconcile" | "vault";
}
/** Separate event preserves the existing 1.0 snapshot contract. Open is emitted
 * even for the same target so consumers can explicitly return to its screen. */
export const ActiveDocumentTransitioned = defineEvent<DocumentTransition>({
  id: "lunaris.active-document-transitioned", version: "1.0.0", consumePermission: "vault.access",
  validate: input => { const value = input as DocumentTransition | null; return !!value && ["open", "close", "restore", "relocate", "reconcile", "vault"].includes(value.reason) &&
    [value.previous, value.current].every(target => target === null || (!!target && typeof target.vaultId === "string" && target.vaultId.length > 0 && validPath(target.path))); },
});
export interface DocumentChangeGuard extends DocumentTransition {
  readonly error: FsFailure | null;
  readonly onSettled: (listener: () => void) => void;
}
export const BeforeActiveDocumentChange = defineHook<DocumentChangeGuard>({
  id: "lunaris.before-active-document-change", version: "1.0.0", consumePermission: "vault.access",
  validate: input => { const value = input as DocumentChangeGuard; return ActiveDocumentTransitioned.validate!(value) && (value.error === null || typeof value.error?.code === "string") && typeof value.onSettled === "function"; },
});
export interface ActiveDocumentApi {
  current(): ActiveDocumentState;
  /** Validate and activate a file in the current Vault; persist its relative path. */
  open(target: FileTarget): Promise<FsResult<null>>;
  close(): Promise<FsResult<null>>;
  /** Called only after a confirmed file/directory move. Remaps descendant paths. */
  relocate(source: FileTarget, destination: FileTarget): Promise<FsResult<null>>;
  /** Check external changes; missing/replaced files close, temporary failures retain state. */
  reconcile(): Promise<FsResult<null>>;
}
export const ActiveDocument = defineApi<ActiveDocumentApi>({ id: "lunaris.active-document", version: "1.0.0", consumePermission: "vault.access",
  validate: value => !!value && typeof value === "object" && ["current", "open", "close", "relocate", "reconcile"].every(key => typeof Object.getOwnPropertyDescriptor(value, key)?.value === "function") });
export const ActiveDocumentChanged = defineEvent<{ readonly current: ActiveDocumentState }>({ id: "lunaris.active-document-changed", version: "1.0.0", consumePermission: "vault.access",
  validate(value) {
    if (!value || typeof value !== "object") return false;
    const current = Object.getOwnPropertyDescriptor(value, "current")?.value;
    return current === null || (!!current && typeof current.vaultId === "string" && current.vaultId.length > 0 && validPath(current.path));
  } });
