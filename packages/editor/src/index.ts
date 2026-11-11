import { defineApi } from "@lunaris/sdk";
import type { CancellationSignal, Disposable } from "@lunaris/sdk";
import type { Extension } from "@codemirror/state";
import type { MarkdownConfig } from "@lezer/markdown";
/** Public CodeMirror 6 adapter contribution. Never replace editor-owned facets. */
export interface EditorExtension {
  readonly id: string;
  readonly extension?: Extension;
  readonly markdown?: MarkdownConfig;
}
export type EditorExtensionResult = { readonly ok: true; readonly value: Disposable } | {
  readonly ok: false; readonly error: { readonly code: "INVALID_ARGUMENT" | "ALREADY_REGISTERED" | "CANCELLED"; readonly message: string };
};
export interface EditorExtensionsApi {
  /** Applies in ID order to current and future views; owner abort removes it. */
  register(contribution: EditorExtension, owner: CancellationSignal): EditorExtensionResult;
}
export const EditorExtensions = defineApi<EditorExtensionsApi>({
  id: "lunaris.editor-extensions", version: "1.0.0", consumePermission: "ui.dom", providePermission: "ui.dom",
  validate: value => !!value && typeof value === "object" && typeof Object.getOwnPropertyDescriptor(value, "register")?.value === "function",
});

export interface EditorDeletionSample {
  readonly width: number;
  readonly height: number;
}
export interface EditorParticle {
  readonly sample: number;
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
  readonly size: number;
  readonly durationMs: number;
}
export interface EditorEffect {
  readonly id: string;
  /** Visible geometry only. Each particle starts at fractional x/y within its sample. */
  onDelete(samples: readonly EditorDeletionSample[]): readonly EditorParticle[];
}
export interface EditorEffectsApi {
  register(effect: EditorEffect, owner: CancellationSignal): EditorExtensionResult;
}
export const EditorEffects = defineApi<EditorEffectsApi>({
  id: "lunaris.editor-effects", version: "1.0.0", consumePermission: "ui.dom", providePermission: "ui.dom",
  validate: value => !!value && typeof value === "object" && typeof Object.getOwnPropertyDescriptor(value, "register")?.value === "function",
});
