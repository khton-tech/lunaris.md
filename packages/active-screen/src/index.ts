import { defineApi, defineEvent } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";

export interface ScreenDefinition {
  readonly id: string;
  readonly componentId: string;
  /** The screen renders the current ActiveDocument; its tabs are keyed by file. */
  readonly document?: true;
  readonly props?: Readonly<Record<string, unknown>>;
}
export interface ScreenSnapshot {
  readonly screens: readonly ScreenDefinition[];
  readonly activeId: string | null;
}
export type ScreenResult = { readonly ok: true; readonly value: null } | {
  readonly ok: false;
  readonly error: { readonly code: "INVALID_ARGUMENT" | "ALREADY_REGISTERED" | "NOT_FOUND"; readonly message: string };
};
export interface ActiveScreenApi {
  /** Registration does not select or mount a screen. */
  register(screen: ScreenDefinition, owner: CancellationSignal): ScreenResult;
  update(id: string, props: Readonly<Record<string, unknown>>): ScreenResult;
  /** Null hides all screens without releasing cached views. */
  select(id: string | null): ScreenResult;
  snapshot(): ScreenSnapshot;
}
export const ActiveScreen = defineApi<ActiveScreenApi>({
  id: "lunaris.active-screen", version: "1.0.0",
  validate: value => !!value && typeof value === "object" && ["register", "update", "select", "snapshot"].every(key => typeof Object.getOwnPropertyDescriptor(value, key)?.value === "function"),
});
export const ActiveScreenChanged = defineEvent<ScreenSnapshot>({
  id: "lunaris.active-screen-changed", version: "1.0.0",
  validate: value => !!value && typeof value === "object" && Array.isArray(Object.getOwnPropertyDescriptor(value, "screens")?.value) &&
    (Object.getOwnPropertyDescriptor(value, "activeId")?.value === null || typeof Object.getOwnPropertyDescriptor(value, "activeId")?.value === "string"),
});
