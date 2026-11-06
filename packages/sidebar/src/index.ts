import { defineApi, defineEvent } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";

export interface SidebarTab {
  readonly id: string;
  /** Already-localized accessible label; update on locale changes. */
  readonly title: string;
  /** Lucide role name. Unknown names use the component set's fallback icon. */
  readonly icon: string;
  readonly componentId: string;
  readonly props?: Readonly<Record<string, unknown>>;
  readonly order?: number;
}
export interface SidebarSnapshot { readonly tabs: readonly SidebarTab[]; readonly activeId: string | null }
export type SidebarResult = { readonly ok: true; readonly value: null } | {
  readonly ok: false; readonly error: { readonly code: "INVALID_ARGUMENT" | "ALREADY_REGISTERED" | "NOT_FOUND"; readonly message: string };
};
export interface SidebarApi {
  register(tab: SidebarTab, owner: CancellationSignal): SidebarResult;
  /** Replace presentation/props while preserving the tab's identity and order. */
  update(id: string, changes: { readonly title: string; readonly icon: string; readonly props?: Readonly<Record<string, unknown>> }): SidebarResult;
  /** Null collapses the panel while preserving the icon rail. */
  select(id: string | null): SidebarResult;
  snapshot(): SidebarSnapshot;
}
export const Sidebar = defineApi<SidebarApi>({
  id: "lunaris.sidebar", version: "1.0.0",
  validate: value => !!value && typeof value === "object" && ["register", "update", "select", "snapshot"].every(key => typeof Object.getOwnPropertyDescriptor(value, key)?.value === "function"),
});
export const SidebarChanged = defineEvent<SidebarSnapshot>({
  id: "lunaris.sidebar-changed", version: "1.0.0",
  validate: value => !!value && typeof value === "object" && Array.isArray(Object.getOwnPropertyDescriptor(value, "tabs")?.value) &&
    (Object.getOwnPropertyDescriptor(value, "activeId")?.value === null || typeof Object.getOwnPropertyDescriptor(value, "activeId")?.value === "string"),
});
