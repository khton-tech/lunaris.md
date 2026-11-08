import { defineApi, defineEvent } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";

export interface WindowCapabilities {
  readonly title: boolean;
  readonly minimize: boolean;
  readonly maximize: boolean;
  readonly close: boolean;
  readonly drag: boolean;
  readonly customTitlebar: boolean;
}
export interface WindowSnapshot {
  readonly sequence: number;
  readonly title: string;
  readonly focused: boolean;
  readonly maximized: boolean;
  readonly capabilities: WindowCapabilities;
}
export type WindowErrorCode = "INVALID_ARGUMENT" | "UNSUPPORTED" | "BUSY" | "CANCELLED" | "NATIVE_FAILED";
export type WindowResult<T = null> = { readonly ok: true; readonly value: T } | {
  readonly ok: false; readonly error: { readonly code: WindowErrorCode; readonly message: string };
};
export interface WindowApi {
  snapshot(): WindowSnapshot;
  setTitle(title: string): Promise<WindowResult>;
  minimize(): Promise<WindowResult>;
  toggleMaximize(): Promise<WindowResult>;
  startDragging(): Promise<WindowResult>;
  /** Request normal closure, including the host's document-save gate. Never destroy. */
  close(): Promise<WindowResult>;
  /** Acquire exclusive custom chrome after mounting controls. Abort restores native chrome. */
  acquireTitlebar(owner: CancellationSignal): Promise<WindowResult>;
}
export const windowMethods = ["snapshot", "setTitle", "minimize", "toggleMaximize", "startDragging", "close", "acquireTitlebar"] as const;
const validateApi = (value: unknown): boolean => !!value && typeof value === "object" &&
  windowMethods.every(name => typeof Object.getOwnPropertyDescriptor(value, name)?.value === "function");
export const Window = defineApi<WindowApi>({ id: "lunaris.window", version: "1.0.0", consumePermission: "window.control", validate: validateApi });
export const WindowDriver = defineApi<WindowApi>({ id: "lunaris.window-driver", version: "1.0.0", providePermission: "window.native", consumePermission: "window.control", validate: validateApi });
export function validWindowSnapshot(value: unknown): value is WindowSnapshot {
  if (!value || typeof value !== "object") return false;
  const get = (name: string): unknown => Object.getOwnPropertyDescriptor(value, name)?.value;
  const capabilities = get("capabilities");
  return Number.isSafeInteger(get("sequence")) && (get("sequence") as number) >= 0 && typeof get("title") === "string" &&
    typeof get("focused") === "boolean" && typeof get("maximized") === "boolean" && !!capabilities && typeof capabilities === "object" &&
    ["title", "minimize", "maximize", "close", "drag", "customTitlebar"].every(name => typeof Object.getOwnPropertyDescriptor(capabilities, name)?.value === "boolean");
}
export const WindowChanged = defineEvent<WindowSnapshot>({ id: "lunaris.window-changed", version: "1.0.0", validate: validWindowSnapshot });
export const DriverWindowChanged = defineEvent<WindowSnapshot>({ id: "lunaris.driver-window-changed", version: "1.0.0", validate: validWindowSnapshot });
export function windowFailure(code: WindowErrorCode, message: string): WindowResult<never> { return { ok: false, error: { code, message } }; }
export function validWindowOwner(owner: CancellationSignal): boolean {
  return !!owner && owner.aborted === false && typeof owner.addEventListener === "function" && typeof owner.removeEventListener === "function";
}
