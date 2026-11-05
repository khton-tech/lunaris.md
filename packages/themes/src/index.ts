import { defineApi, defineEvent } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";

/** Portable theme data. Interpretation belongs to the theme engine and renderers. */
export type ThemeValue = string | number | boolean | null | readonly ThemeValue[] | ThemeProperties;
export interface ThemeProperties { readonly [key: string]: ThemeValue }
export interface ThemeDefinition {
  readonly id: string;
  /** Author-supplied display name, not a provider-owned UI message. */
  readonly name: string;
  readonly properties: ThemeProperties;
}
export type ThemeErrorCode = "INVALID_ARGUMENT" | "ALREADY_REGISTERED" | "NOT_FOUND";
export type ThemeResult = { readonly ok: true; readonly value: null } | {
  readonly ok: false; readonly error: { readonly code: ThemeErrorCode; readonly message: string };
};
export interface ThemesApi {
  register(theme: ThemeDefinition, owner: CancellationSignal): ThemeResult;
  /** Replace a registered description atomically, preserving its original owner. */
  update(theme: ThemeDefinition): ThemeResult;
  get(id: string): ThemeDefinition | undefined;
  list(): readonly ThemeDefinition[];
  current(): ThemeDefinition | null;
  /** Null explicitly clears selection. Registration never selects a theme. */
  select(id: string | null): ThemeResult;
}
export interface ThemeChange {
  readonly kind: "registered" | "updated" | "removed" | "selected";
  readonly themeId: string | null;
  readonly previous: string | null;
  readonly current: string | null;
}
export const Themes = defineApi<ThemesApi>({
  id: "lunaris.themes", version: "1.0.0",
  validate: value => value !== null && typeof value === "object" &&
    ["register", "update", "get", "list", "current", "select"].every(name => typeof Object.getOwnPropertyDescriptor(value, name)?.value === "function"),
});
export const ThemeChanged = defineEvent<ThemeChange>({
  id: "lunaris.theme-changed", version: "1.0.0",
  validate(value) {
    if (!value || typeof value !== "object") return false;
    const field = (name: string): unknown => Object.getOwnPropertyDescriptor(value, name)?.value;
    const nullableId = (item: unknown): boolean => item === null || typeof item === "string";
    const kind = field("kind");
    return ["registered", "updated", "removed", "selected"].includes(kind as string) &&
      nullableId(field("previous")) && nullableId(field("current")) &&
      (kind === "selected" ? nullableId(field("themeId")) : typeof field("themeId") === "string");
  },
});
