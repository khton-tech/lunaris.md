import { defineApi, defineEvent } from "@lunaris/sdk";
import type { FileTarget, FsResult } from "@lunaris/filesystem";

export interface NoteLink {
  readonly from: number;
  readonly to: number;
  readonly destination: string;
  readonly wiki: boolean;
  /** Visible wikilink label, using offsets in the parsed source. */
  readonly label?: { readonly from: number; readonly to: number };
}
export interface NoteDestination { readonly target: FileTarget; readonly text: string; readonly from: number; readonly to: number }
/** Shared parsing/resolution keeps editor navigation and incoming-link indexing consistent. */
export const NoteLinks = defineApi<{
  parse(text: string): readonly NoteLink[];
  /** Source offsets of wikilinks whose note is absent from the ready index. Refresh on BacklinksChanged. */
  missingTargets(source: FileTarget, links: readonly NoteLink[]): readonly number[];
  /** Passing the displayed source explicitly allows creation of a missing wikilink target. */
  resolve(source: FileTarget, link: NoteLink, options?: { readonly createFromSource: string }): Promise<FsResult<NoteDestination>>;
}>({ id: "lunaris.note-links", version: "1.0.0", consumePermission: "vault.access",
  validate: value => !!value && typeof value === "object" && ["parse", "missingTargets", "resolve"].every(key => typeof Object.getOwnPropertyDescriptor(value, key)?.value === "function") });

export interface Mention {
  readonly from: number;
  readonly to: number;
  readonly line: number;
  readonly contextFrom: number;
  readonly contextTo: number;
}
export interface MentionGroup {
  readonly source: FileTarget;
  /** Snapshot used to guard navigation and replacement against concurrent edits. */
  readonly text: string;
  readonly modifiedAt: number | null;
  readonly mentions: readonly Mention[];
}
export interface BacklinksSnapshot {
  readonly state: "loading" | "ready" | "degraded";
  readonly failures: number;
  readonly linked: readonly MentionGroup[];
  readonly unlinked: readonly MentionGroup[];
}
export interface BacklinksApi {
  query(target: FileTarget, excludedPaths?: readonly string[]): BacklinksSnapshot;
  refresh(): Promise<void>;
  /** Revalidates an unlinked occurrence before making one undoable edit. */
  link(target: FileTarget, source: FileTarget, mention: Mention, expectedText: string): Promise<FsResult<null>>;
}
export const Backlinks = defineApi<BacklinksApi>({ id: "lunaris.backlinks", version: "1.0.0", consumePermission: "vault.access",
  validate: value => !!value && typeof value === "object" && ["query", "refresh", "link"].every(key => typeof Object.getOwnPropertyDescriptor(value, key)?.value === "function") });
export const BacklinksChanged = defineEvent<{ readonly vaultId: string | null }>({ id: "lunaris.backlinks-changed", version: "1.0.0", consumePermission: "vault.access",
  validate: value => !!value && typeof value === "object" && ((value as { vaultId?: unknown }).vaultId === null || typeof (value as { vaultId?: unknown }).vaultId === "string") });
