import { defineApi, defineEvent } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";

export type Messages = Readonly<Record<string, string>>;
/** Every plugin supplies English; additional locale catalogs may be partial. */
export type Catalogs = Readonly<Record<string, Messages>> & { readonly en: Messages };
export type MessageParameters = Readonly<Record<string, string | number>>;
export type LocalizationResult = { readonly ok: true; readonly value: null } | {
  readonly ok: false;
  readonly error: { readonly code: "INVALID_ARGUMENT" | "ALREADY_REGISTERED" | "UNSUPPORTED_LOCALE"; readonly message: string };
};
export interface LocalizationApi {
  locale(): string;
  locales(): readonly string[];
  setLocale(locale: string): LocalizationResult;
  register(pluginId: string, catalogs: Catalogs, owner: CancellationSignal): LocalizationResult;
  text(pluginId: string, key: string, parameters?: MessageParameters): string;
}
export interface LocaleChange { readonly previous: string; readonly current: string }
export const Localization = defineApi<LocalizationApi>({
  id: "lunaris.localization", version: "1.0.0",
  validate: value => value !== null && typeof value === "object" &&
    ["locale", "locales", "setLocale", "register", "text"].every(name => typeof Object.getOwnPropertyDescriptor(value, name)?.value === "function"),
});
export const LocaleChanged = defineEvent<LocaleChange>({
  id: "lunaris.locale-changed", version: "1.0.0",
  validate: value => value !== null && typeof value === "object" &&
    typeof (value as LocaleChange).previous === "string" && typeof (value as LocaleChange).current === "string",
});
