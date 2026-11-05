import type { Catalogs, Messages, MessageParameters } from "@lunaris/localization";

export function canonicalLocale(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try { return Intl.getCanonicalLocales(value)[0]; } catch { return undefined; }
}
export function validName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !/[\u0000-\u001f\u007f]/.test(value) &&
    !["__proto__", "prototype", "constructor"].includes(value);
}
function data(value: unknown): Record<string, PropertyDescriptor> | undefined {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return undefined;
  const fields = Object.getOwnPropertyDescriptors(value);
  return Object.values(fields).every(field => "value" in field) ? fields : undefined;
}
/** Copy at registration so callers cannot mutate an active catalog. */
export function copyCatalogs(input: Catalogs): ReadonlyMap<string, Messages> | undefined {
  const locales = data(input);
  if (!locales || !Object.hasOwn(locales, "en")) return undefined;
  const result = new Map<string, Messages>();
  for (const [name, descriptor] of Object.entries(locales)) {
    const locale = canonicalLocale(name);
    const fields = data(descriptor.value);
    if (!locale || !fields || result.has(locale)) return undefined;
    const messages: Record<string, string> = Object.create(null);
    for (const [key, field] of Object.entries(fields)) {
      if (!validName(key) || typeof field.value !== "string") return undefined;
      messages[key] = field.value;
    }
    result.set(locale, Object.freeze(messages));
  }
  const english = result.get("en")!;
  if (Object.keys(english).length === 0) return undefined;
  for (const messages of result.values()) {
    if (Object.keys(messages).some(key => !Object.hasOwn(english, key))) return undefined;
  }
  return result;
}
/** Plain text only: no HTML, evaluation, recursive substitutions or implicit escaping. */
export function format(message: string, parameters: MessageParameters | undefined, missing: (name: string) => void): string {
  return message.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (token, name: string) => {
    const field = parameters && typeof parameters === "object" ? Object.getOwnPropertyDescriptor(parameters, name) : undefined;
    const value: unknown = field && "value" in field ? field.value : undefined;
    if (typeof value === "string" || (typeof value === "number" && Number.isFinite(value))) return String(value);
    missing(name);
    return token;
  });
}
