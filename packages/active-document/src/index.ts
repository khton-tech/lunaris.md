import { defineApi, defineEvent, defineHook } from "@lunaris/sdk";

/** Synchronous unload query; no document text or privileged handles are exposed. */
export const DocumentProtection = defineApi<{ hasUnprotectedChanges(): boolean }>({ id: "lunaris.document-protection", version: "1.0.0", consumePermission: "vault.access",
  validate: value => value !== null && typeof value === "object" && typeof Object.getOwnPropertyDescriptor(value, "hasUnprotectedChanges")?.value === "function" });
import { validPath } from "@lunaris/filesystem";
import type { FileTarget, FsResult, FsFailure } from "@lunaris/filesystem";
/** Current text includes unsaved editor changes. Offsets use UTF-16, as JavaScript strings do. */
export interface DocumentText { readonly text: string; readonly version: string }
export interface DocumentRange { readonly from: number; readonly to: number }
export interface DocumentContentApi {
  buffers(): readonly { readonly target: FileTarget; readonly text: string; readonly version: string }[];
  read(target: FileTarget): Promise<FsResult<DocumentText>>;
  /** Opens the source through the normal transition guard. Rejects stale results. */
  reveal(target: FileTarget, range: DocumentRange, expectedText: string): Promise<FsResult<null>>;
  /** One undoable editor transaction; autosave and conflict handling stay with the editor. */
  replace(target: FileTarget, range: DocumentRange, insert: string, expectedText: string): Promise<FsResult<null>>;
}
export const DocumentContent = defineApi<DocumentContentApi>({ id: "lunaris.document-content", version: "1.0.0", consumePermission: "vault.access",
  validate: value => !!value && typeof value === "object" && ["buffers", "read", "reveal", "replace"].every(key => typeof Object.getOwnPropertyDescriptor(value, key)?.value === "function") });
/** Invalidation only: consumers obtain authorized text through DocumentContent. */
export const DocumentContentChanged = defineEvent<{ readonly target: FileTarget }>({ id: "lunaris.document-content-changed", version: "1.0.0", consumePermission: "vault.access",
  validate: value => !!value && typeof value === "object" && typeof (value as { target?: FileTarget }).target?.vaultId === "string" && validPath((value as { target: FileTarget }).target.path) });
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

/** Statistics of the current editor buffer, including unsaved edits. No text escapes. */
export interface DocumentStatisticsState {
  readonly target: Readonly<FileTarget>;
  readonly state: "loading" | "unavailable" | "ready";
  readonly words: number | null;
  readonly letters: number | null;
}
export type DocumentStatisticsSnapshot = Readonly<DocumentStatisticsState> | null;
export const DocumentStatistics = defineApi<{ current(): DocumentStatisticsSnapshot }>({
  id: "lunaris.document-statistics", version: "1.0.0", consumePermission: "vault.access",
  validate: value => !!value && typeof value === "object" && typeof Object.getOwnPropertyDescriptor(value, "current")?.value === "function",
});
export const DocumentStatisticsChanged = defineEvent<{ readonly current: DocumentStatisticsSnapshot }>({
  id: "lunaris.document-statistics-changed", version: "1.0.0", consumePermission: "vault.access",
  validate: input => {
    const value = input as { current?: DocumentStatisticsSnapshot } | null;
    if (!value || value.current === undefined) return false;
    const current = value.current;
    return current === null || (!!current.target && typeof current.target.vaultId === "string" && current.target.vaultId.length > 0 && validPath(current.target.path) &&
      (current.state === "ready" ? [current.words, current.letters].every(count => typeof count === "number" && Number.isSafeInteger(count) && count >= 0) :
        ["loading", "unavailable"].includes(current.state) && current.words === null && current.letters === null));
  },
});
