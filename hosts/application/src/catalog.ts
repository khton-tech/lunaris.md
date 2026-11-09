import { english } from "./locales/en.js";

export type MessageKey = keyof typeof english;

/** Recovery text remains available even if the localization plugin fails. */
export function message(key: MessageKey): string {
  return english[key];
}
