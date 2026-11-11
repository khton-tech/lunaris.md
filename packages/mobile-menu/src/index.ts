import { defineApi } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";
export interface MobileMenuOption {
 readonly id: string;
 readonly label: string;
 readonly title?: string;
 readonly icon?: string;
 readonly disabled?: boolean;
}
export interface MobileMenuChoice extends MobileMenuOption {
 readonly trailingAction?: MobileMenuOption;
}
export interface MobileMenuItem {
 readonly id: string;
 readonly label: string;
 readonly icon: string;
 readonly placement?: "panel" | "launcher";
 readonly order?: number;
 readonly disabled?: boolean;
 /** When set, the action shows this number inside a page outline instead of its icon. */
 readonly count?: number;
 readonly choices?: readonly MobileMenuChoice[];
 readonly selectedChoiceId?: string | null;
 /** An action with choices receives the chosen ID. A plain action receives no arguments. */
 readonly onPress: (choiceId?: string) => void | Promise<void>;
}
export type MobileMenuResult = { readonly ok: true } | { readonly ok: false; readonly error: string };
export interface MobileMenuApi {
 register(item: MobileMenuItem, owner: CancellationSignal): MobileMenuResult;
 update(item: MobileMenuItem): MobileMenuResult;
 list(): readonly MobileMenuItem[];
}
export const MobileMenu = defineApi<MobileMenuApi>({ id: "lunaris.mobile-menu", version: "1.5.0", validate: value => !!value && typeof value === "object" && ["register", "update", "list"].every(key => typeof Object.getOwnPropertyDescriptor(value,key)?.value === "function") });
