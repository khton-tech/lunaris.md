import { defineApi, defineEvent } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";

export interface SettingsCategory { readonly id: string; readonly title: string; readonly order?: number }
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
}
export type SettingsResult = { readonly ok: true; readonly value: null } | {
  readonly ok: false; readonly error: { readonly code: "INVALID_ARGUMENT" | "ALREADY_REGISTERED" | "NOT_FOUND"; readonly message: string };
};
export interface SettingsApi {
  registerCategory(category: SettingsCategory, owner: CancellationSignal): SettingsResult;
  registerSection(section: SettingsSection, owner: CancellationSignal): SettingsResult;
  updateCategory(id: string, changes: { readonly title: string }): SettingsResult;
  updateSection(id: string, changes: { readonly title: string; readonly props?: Readonly<Record<string, unknown>> }): SettingsResult;
  snapshot(): SettingsSnapshot;
}
export const Settings = defineApi<SettingsApi>({
  id: "lunaris.settings", version: "1.0.0",
  validate: value => !!value && typeof value === "object" && ["registerCategory", "registerSection", "updateCategory", "updateSection", "snapshot"].every(key => typeof Object.getOwnPropertyDescriptor(value, key)?.value === "function"),
});
export const SettingsChanged = defineEvent<SettingsSnapshot>({
  id: "lunaris.settings-changed", version: "1.0.0",
  validate: value => !!value && typeof value === "object" && ["categories", "sections"].every(key => Array.isArray(Object.getOwnPropertyDescriptor(value, key)?.value)),
});
