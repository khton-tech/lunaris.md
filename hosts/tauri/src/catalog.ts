import { english } from "./locales/en.js";
import { russian } from "./locales/ru.js";

export type MessageKey = keyof typeof english;

/** Recovery text remains available even if the localization plugin fails. */
export function message(key: MessageKey, locale = "en"): string {
  return (locale.startsWith("ru") ? russian : english)[key];
}
