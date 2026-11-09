import { defineApi } from "@lunaris/sdk";
import type { CancellationSignal, MaybePromise } from "@lunaris/sdk";

/** Source and target are cooperative identifiers, not caller authentication. */
export interface MenuContext {
  readonly source: string;
  readonly target: string;
  /** Shallow frozen application data; callers own nested value immutability. */
  readonly data: Readonly<Record<string, unknown>>;
}
interface MenuEntryBase {
  readonly id: string;
  /** Already localized; build contributions again after locale changes. */
  readonly label: string;
  /** Public Lucide role name; renderers use a generic action/folder fallback. */
  readonly icon?: string;
  readonly order?: number;
  /** Unavailable entries are omitted from the resolved menu. */
  readonly disabled?: boolean;
}
export type MenuEntry = MenuEntryBase & (
  { readonly kind: "action"; readonly run: (context: MenuContext) => MaybePromise<void> } |
  { readonly kind: "group" | "island"; readonly children: readonly MenuEntry[] }
);
export type MenuItem = MenuEntryBase & (
  { readonly kind: "action" } | { readonly kind: "group" | "island"; readonly children: readonly MenuItem[] }
);
export interface MenuContribution {
  readonly id: string;
  /** Called on each opening. Return [] for contexts this contribution does not support. */
  readonly build: (context: MenuContext) => readonly MenuEntry[];
}
export type MenuResult<T> = { readonly ok: true; readonly value: T } | {
  readonly ok: false;
  readonly error: { readonly code: "INVALID_ARGUMENT" | "ALREADY_REGISTERED" | "NOT_FOUND" | "UNAVAILABLE" | "BUILD_FAILED" | "ACTION_FAILED"; readonly message: string };
};
/** One immutable opening. Execute at most one action; dispose when the view closes. */
export interface MenuSession {
  readonly items: readonly MenuItem[];
  execute(id: string): Promise<MenuResult<null>>;
  dispose(): void;
}
export interface MenuOpenRequest {
  /** A connected source element; its document hosts the owned overlay and focus returns here. */
  readonly target: HTMLElement;
  /** Viewport coordinates, normally MouseEvent.clientX/clientY. */
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly context: MenuContext;
  readonly entries?: readonly MenuEntry[];
}
export interface ContextMenuApi {
  register(contribution: MenuContribution, owner: CancellationSignal): MenuResult<{ dispose(): void }>;
  /** Local entries capture view-specific commands without registering stale view callbacks globally. */
  resolve(context: MenuContext, owner: CancellationSignal, localEntries?: readonly MenuEntry[]): MenuResult<MenuSession>;
  /** Open the shared component role in an owned document overlay. One menu is open at a time. */
  open(request: MenuOpenRequest, owner: CancellationSignal): MenuResult<MenuSession>;
}
export const ContextMenu = defineApi<ContextMenuApi>({
  id: "lunaris.context-menu", version: "1.1.0",
  validate: value => !!value && typeof value === "object" && ["register", "resolve", "open"].every(key => typeof Object.getOwnPropertyDescriptor(value, key)?.value === "function"),
});
