import { defineApi } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";
export interface MobileMenuItem {
 readonly id: string;
 readonly label: string;
 readonly icon: string;
 readonly placement?: "panel" | "launcher";
 readonly order?: number;
 readonly disabled?: boolean;
 /** When set, the action shows this number inside a page outline instead of its icon. */
 readonly count?: number;
 readonly onPress: () => void | Promise<void>;
}
export type MobileMenuResult = { readonly ok: true } | { readonly ok: false; readonly error: string };
export interface MobileMenuApi {
 register(item: MobileMenuItem, owner: CancellationSignal): MobileMenuResult;
 update(item: MobileMenuItem): MobileMenuResult;
 list(): readonly MobileMenuItem[];
}
export const MobileMenu = defineApi<MobileMenuApi>({ id: "lunaris.mobile-menu", version: "1.2.0", validate: value => !!value && typeof value === "object" && ["register", "update", "list"].every(key => typeof Object.getOwnPropertyDescriptor(value,key)?.value === "function") });
