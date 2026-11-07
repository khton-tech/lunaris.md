import type { SettingsCategory, SettingsSection } from "@lunaris/settings";

export function record(value: unknown, keys?: readonly string[]): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return;
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).some(key => typeof key !== "string" || ["__proto__", "workspace"].includes(key) || (keys && !keys.includes(key)) || !("value" in fields[key]!))) return;
  return Object.freeze(Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value])));
}
const validId = (value: unknown): value is string => typeof value === "string" && /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(value);
export const validTitle = (value: unknown): value is string => typeof value === "string" && !!value.trim();
export function readCategory(value: unknown): SettingsCategory | undefined {
  const data = record(value, ["id", "title", "order"]); if (!data) return;
  const order = data.order === undefined ? 0 : data.order;
  if (!validId(data.id) || !validTitle(data.title) || typeof order !== "number" || !Number.isSafeInteger(order)) return;
  return Object.freeze({ id: data.id, title: data.title, order });
}
export function readSection(value: unknown): SettingsSection | undefined {
  const data = record(value, ["id", "categoryId", "title", "componentId", "props", "order"]); if (!data) return;
  const category = readCategory({ id: data.id, title: data.title, order: data.order });
  const props = record(data.props === undefined ? {} : data.props);
  if (!category || !validId(data.categoryId) || !validId(data.componentId) || !props) return;
  return Object.freeze({ ...category, categoryId: data.categoryId, componentId: data.componentId, props });
}
