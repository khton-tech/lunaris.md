import { defineApi } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";
import type { ComponentProps } from "@lunaris/components";
import type { WindowResult } from "./index.js";

export interface WindowSize { readonly width: number; readonly height: number }
export interface WindowPosition { readonly x: number; readonly y: number }
export type WindowAnchor = "top-left" | "top-center" | "top-right" | "center-left" | "center-right" |
  "bottom-left" | "bottom-center" | "bottom-right";
export type ExternalWindowPosition = WindowPosition | WindowAnchor;
export type WindowLayer = "bottom" | "normal" | "top";

const anchors: readonly WindowAnchor[] = ["top-left", "top-center", "top-right", "center-left", "center-right",
  "bottom-left", "bottom-center", "bottom-right"];

export interface NativeExternalWindowOptions {
  /** Accessible window title. The operating system may use it in its window list. */
  readonly title: string;
  /** Size in logical pixels. */
  readonly size: WindowSize;
  /** Anchor in the primary monitor's work area, or logical desktop coordinates. */
  readonly position?: ExternalWindowPosition;
  /** Native stacking level. Defaults to normal. */
  readonly layer?: WindowLayer;
  /** @deprecated Use layer: "top". An explicit layer takes precedence. */
  readonly alwaysOnTop?: boolean;
  readonly skipTaskbar?: boolean;
  readonly focusable?: boolean;
}

export interface ExternalWindowOptions extends NativeExternalWindowOptions {
  readonly componentId: string;
  readonly props?: ComponentProps;
  /** Show after mounting the component. Defaults to true. */
  readonly visible?: boolean;
}

export interface ExternalWindowControls {
  readonly closed: Promise<void>;
  show(): Promise<WindowResult>;
  hide(): Promise<WindowResult>;
  /** Change the anchor, or detach from it and move to explicit coordinates. */
  move(position: ExternalWindowPosition): Promise<WindowResult>;
  resize(size: WindowSize): Promise<WindowResult>;
  close(): Promise<WindowResult>;
}

export interface ExternalWindow extends ExternalWindowControls {
  update(props: ComponentProps): WindowResult;
}

export interface ExternalWindowSurface extends ExternalWindowControls {
  readonly target: HTMLElement;
  readonly signal: CancellationSignal;
}

export interface ExternalWindowsApi {
  supported(): boolean;
  open(options: ExternalWindowOptions, owner: CancellationSignal): Promise<WindowResult<ExternalWindow>>;
}

export interface ExternalWindowDriverApi {
  supported(): boolean;
  /** Create a hidden, undecorated window with an empty mount target. */
  open(options: NativeExternalWindowOptions, owner: CancellationSignal): Promise<WindowResult<ExternalWindowSurface>>;
}

const validate = (value: unknown): boolean => !!value && typeof value === "object" &&
  ["supported", "open"].every(key => typeof Object.getOwnPropertyDescriptor(value, key)?.value === "function");

export const ExternalWindows = defineApi<ExternalWindowsApi>({
  id: "lunaris.external-windows", version: "1.0.0", consumePermission: "window.external", validate,
});
export const ExternalWindowDriver = defineApi<ExternalWindowDriverApi>({
  id: "lunaris.external-window-driver", version: "1.0.0", providePermission: "window.native", consumePermission: "ui.dom", validate,
});

export function validWindowSize(size: unknown): size is WindowSize {
  if (!size || typeof size !== "object") return false;
  const { width, height } = size as WindowSize;
  return Number.isFinite(width) && width >= 1 && width <= 16384 && Number.isFinite(height) && height >= 1 && height <= 16384;
}

export function validWindowPosition(position: unknown): position is WindowPosition {
  if (!position || typeof position !== "object") return false;
  const { x, y } = position as WindowPosition;
  return Number.isFinite(x) && Math.abs(x) <= 100000 && Number.isFinite(y) && Math.abs(y) <= 100000;
}

export function validExternalWindowPosition(position: unknown): position is ExternalWindowPosition {
  return typeof position === "string" ? anchors.includes(position as WindowAnchor) : validWindowPosition(position);
}

export function validWindowLayer(layer: unknown): layer is WindowLayer {
  return layer === "bottom" || layer === "normal" || layer === "top";
}
