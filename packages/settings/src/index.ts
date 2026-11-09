import { defineApi, defineEvent } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";

export interface SettingsCategory { readonly id: string; readonly title: string; readonly icon?: string; readonly order?: number }
export interface SettingsGroup extends Omit<SettingsCategory, "icon"> { readonly categoryId: string; readonly description?: string }
export interface SettingsItemContext { readonly vaultId: string; readonly signal: CancellationSignal }
interface ItemPresentation {
  readonly title: string; readonly description?: string; readonly layout?: "inline" | "stacked";
  readonly disabled?: boolean; readonly error?: string; readonly retryLabel?: string;
  readonly onRetry?: (context: SettingsItemContext) => void | Promise<void>;
  readonly resetLabel?: string; readonly resetDisabled?: boolean;
  readonly onReset?: (context: SettingsItemContext) => void | Promise<void>;
}
interface Control<T, K extends string> extends ItemPresentation {
  readonly type: K; readonly value: T;
  readonly onChange: (value: T, context: SettingsItemContext) => void | Promise<void>;
}
export interface SettingsOption { readonly value: string; readonly label: string }
export type SettingsItemUpdate =
  | (Control<string, "select"> & { readonly options: readonly SettingsOption[] })
  | Control<boolean, "switch">
  | (Control<string, "text"> & { readonly placeholder?: string })
  | (Control<number, "slider"> & { readonly min: number; readonly max: number; readonly step: number; readonly unit?: string })
  | (Control<number, "number"> & { readonly min?: number; readonly max?: number; readonly step?: number });
/** Identity and structural placement stay unchanged on presentation/value updates. */
export type SettingsItem = SettingsItemUpdate & { readonly id: string; readonly groupId: string; readonly order?: number };
export interface SettingsSection {
  readonly id: string;
  readonly categoryId: string;
  readonly title: string;
  readonly componentId: string;
  readonly order?: number;
  readonly props?: Readonly<Record<string, unknown>>;
}
export interface SettingsSnapshot {
  readonly categories: readonly SettingsCategory[];
  readonly sections: readonly SettingsSection[];
  readonly groups: readonly SettingsGroup[];
  readonly items: readonly SettingsItem[];
}
export type SettingsResult = { readonly ok: true; readonly value: null } | {
  readonly ok: false; readonly error: { readonly code: "INVALID_ARGUMENT" | "ALREADY_REGISTERED" | "NOT_FOUND"; readonly message: string };
};
export interface SettingsApi {
  registerCategory(category: SettingsCategory, owner: CancellationSignal): SettingsResult;
  registerSection(section: SettingsSection, owner: CancellationSignal): SettingsResult;
  registerGroup(group: SettingsGroup, owner: CancellationSignal): SettingsResult;
  registerItem(item: SettingsItem, owner: CancellationSignal): SettingsResult;
  updateGroup(id: string, changes: { readonly title: string; readonly description?: string }): SettingsResult;
  updateItem(id: string, changes: SettingsItemUpdate): SettingsResult;
  updateCategory(id: string, changes: { readonly title: string; readonly icon?: string }): SettingsResult;
  updateSection(id: string, changes: { readonly title: string; readonly props?: Readonly<Record<string, unknown>> }): SettingsResult;
  snapshot(): SettingsSnapshot;
}
export const Settings = defineApi<SettingsApi>({
  id: "lunaris.settings", version: "1.2.0",
  validate: value => !!value && typeof value === "object" && ["registerCategory", "registerSection", "updateCategory", "updateSection", "registerGroup", "registerItem", "updateGroup", "updateItem", "snapshot"].every(key => typeof Object.getOwnPropertyDescriptor(value, key)?.value === "function"),
});
export const SettingsChanged = defineEvent<SettingsSnapshot>({
  id: "lunaris.settings-changed", version: "1.2.0",
  validate: value => !!value && typeof value === "object" && ["categories", "sections", "groups", "items"].every(key => Array.isArray(Object.getOwnPropertyDescriptor(value, key)?.value)),
});
