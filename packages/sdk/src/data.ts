import { LunarisError } from "./errors.js";
import type { ErrorCode } from "./errors.js";

/** Copy only declared own data fields, without invoking metadata accessors. */
export function readDataObject(input: unknown, fields: readonly string[], code: ErrorCode): Record<string, unknown> {
  if (input === null || typeof input !== "object" ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    throw new LunarisError(code, "Expected a plain data object.");
  }
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== "string" || !fields.includes(key) || !descriptor?.enumerable || !("value" in descriptor)) {
      throw new LunarisError(code, "Unknown or non-data metadata field.", { path: typeof key === "string" ? `$.${key}` : "$" });
    }
    copy[key] = descriptor.value;
  }
  return copy;
}
