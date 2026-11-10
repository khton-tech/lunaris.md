import { defineApi } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";
export interface MobileMenuItem { readonly id: string; readonly label: string; readonly icon: string; readonly order?: number; readonly disabled?: boolean; readonly onPress: () => void | Promise<void> }
export type MobileMenuResult = { readonly ok: true } | { readonly ok: false; readonly error: string };
export interface MobileMenuApi {
 register(item: MobileMenuItem, owner: CancellationSignal): MobileMenuResult;
 update(item: MobileMenuItem): MobileMenuResult;
 list(): readonly MobileMenuItem[];
}
export const MobileMenu = defineApi<MobileMenuApi>({ id: "lunaris.mobile-menu", version: "1.0.0", validate: value => !!value && typeof value === "object" && ["register", "update", "list"].every(key => typeof Object.getOwnPropertyDescriptor(value,key)?.value === "function") });
