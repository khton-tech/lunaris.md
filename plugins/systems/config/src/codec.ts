import { parse, stringify, TomlDate } from "smol-toml";
import { validConfigKey } from "@lunaris/config";
import type { ConfigTable, ConfigValue } from "@lunaris/config";

export class ConfigDataError extends Error {
  constructor(readonly code: "INVALID_TOML" | "INVALID_CONFIG" | "INVALID_VALUE", message: string) { super(message); }
}
export function isTable(value: unknown): value is Record<string, ConfigValue> {
  return value !== null && typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
/** Snapshot before queuing; reject values the TOML serializer would silently omit. */
export function snapshot(value: unknown, ancestors = new Set<object>(), depth = 0): ConfigValue {
  if (depth > 64) throw new ConfigDataError("INVALID_VALUE", "Configuration nesting exceeds 64 levels.");
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && (!Number.isInteger(value) || Number.isSafeInteger(value))) return value;
  if (typeof value === "bigint" && value >= -(2n ** 63n) && value < 2n ** 63n) return value;
  if (value instanceof Date) {
    if (!Number.isFinite(Date.prototype.getTime.call(value))) throw new ConfigDataError("INVALID_VALUE", "A valid date is required.");
    return new TomlDate(value instanceof TomlDate ? TomlDate.prototype.toISOString.call(value) : Date.prototype.toISOString.call(value));
  }
  if (typeof value !== "object" || value === null || ancestors.has(value)) throw new ConfigDataError("INVALID_VALUE", "A non-cyclic TOML value is required.");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Reflect.ownKeys(value).length !== value.length + 1) throw new ConfigDataError("INVALID_VALUE", "Dense arrays without extra properties are required.");
      return Array.from({ length: value.length }, (_, index) => {
        const item = Object.getOwnPropertyDescriptor(value, String(index));
        if (!item || !("value" in item)) throw new ConfigDataError("INVALID_VALUE", "Array accessors are not supported.");
        return snapshot(item.value, ancestors, depth + 1);
      });
    }
    if (!isTable(value)) throw new ConfigDataError("INVALID_VALUE", "Plain configuration tables are required.");
    const result: Record<string, ConfigValue> = {};
    for (const key of Reflect.ownKeys(value)) {
      const item = Object.getOwnPropertyDescriptor(value, key)!;
      if (!validConfigKey(key) || !("value" in item) || !item.enumerable) throw new ConfigDataError("INVALID_VALUE", "Configuration keys must be safe enumerable data properties.");
      result[key] = snapshot(item.value, ancestors, depth + 1);
    }
    return result;
  } finally { ancestors.delete(value); }
}
export function decode(text: string): Record<string, ConfigValue> {
  let document: unknown;
  try { document = parse(text, { integersAsBigInt: "asNeeded", unsafeKeyBehaviour: "throw", maxDepth: 64 }); }
  catch {
    // Parser errors can include source text and secrets. Surface a safe domain error.
    throw new ConfigDataError("INVALID_TOML", "The configuration file is not valid TOML.");
  }
  const copy = snapshot(document);
  if (!isTable(copy) || (Object.hasOwn(copy, "plugins") && !isTable(copy.plugins))) throw new ConfigDataError("INVALID_CONFIG", "The plugins field must be a table.");
  if (isTable(copy.plugins) && Object.values(copy.plugins).some(section => !isTable(section))) {
    throw new ConfigDataError("INVALID_CONFIG", "Each plugin configuration must be a table.");
  }
  return copy;
}
export function encode(document: ConfigTable): string {
  try { return stringify(document); }
  catch { throw new ConfigDataError("INVALID_VALUE", "The configuration cannot be represented as TOML."); }
}
export function section(document: ConfigTable, pluginId: string): ConfigTable {
  const plugins = document.plugins;
  return isTable(plugins) && Object.hasOwn(plugins, pluginId) && isTable(plugins[pluginId]) ? plugins[pluginId] : {};
}
/** Tables merge recursively; every other local value replaces the global value. */
export function merge(global: ConfigTable, local: ConfigTable): ConfigTable {
  const result = snapshot(global) as Record<string, ConfigValue>;
  for (const [key, value] of Object.entries(local)) {
    result[key] = Object.hasOwn(result, key) && isTable(result[key]) && isTable(value) ? merge(result[key], value) : snapshot(value);
  }
  return result;
}
