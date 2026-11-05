import type { ThemeDefinition, ThemeValue, ThemeProperties } from "@lunaris/themes";

const reserved = new Set(["__proto__", "prototype", "constructor"]);
export const isThemeId = (value: unknown): value is string => typeof value === "string" && /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(value);
const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));

/** Copy only portable data; never execute getters or retain engine-owned objects. */
export function copyTheme(input: unknown): ThemeDefinition | undefined {
  try {
    if (!plain(input) || Reflect.ownKeys(input).length !== 3) return;
    const fields = Object.getOwnPropertyDescriptors(input);
    if (Object.values(fields).some(field => !("value" in field))) return;
    const id: unknown = fields.id?.value;
    const name: unknown = fields.name?.value;
    const properties: unknown = fields.properties?.value;
    if (!isThemeId(id) || typeof name !== "string" || !name.trim() || !plain(properties)) return;
    const ancestors = new Set<object>();
    let count = 0;
    function copy(value: unknown, depth: number): ThemeValue {
      if (++count > 10000 || depth > 32) throw new Error("Theme data limit exceeded.");
      if (value === null || typeof value === "string" || typeof value === "boolean") return value;
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (!value || typeof value !== "object" || ancestors.has(value)) throw new Error("Invalid theme value.");
      ancestors.add(value);
      try {
        if (Array.isArray(value)) {
          const keys = Reflect.ownKeys(value);
          if (keys.length !== value.length + 1) throw new Error("Invalid theme array.");
          const result: ThemeValue[] = [];
          for (let index = 0; index < value.length; index++) {
            const field = Object.getOwnPropertyDescriptor(value, String(index));
            if (!field || !("value" in field)) throw new Error("Invalid theme array item.");
            result.push(copy(field.value, depth + 1));
          }
          return Object.freeze(result);
        }
        if (!plain(value)) throw new Error("Theme objects must be plain data.");
        const entries: [string, ThemeValue][] = [];
        for (const key of Reflect.ownKeys(value)) {
          const field = Object.getOwnPropertyDescriptor(value, key)!;
          if (typeof key !== "string" || !key || reserved.has(key) || !("value" in field)) throw new Error("Invalid theme property.");
          entries.push([key, copy(field.value, depth + 1)]);
        }
        return Object.freeze(Object.fromEntries(entries));
      } finally { ancestors.delete(value); }
    }
    return Object.freeze({ id, name, properties: copy(properties, 0) as ThemeProperties });
  } catch { return undefined; }
}
