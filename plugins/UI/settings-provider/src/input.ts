import type { SettingsCategory, SettingsSection, SettingsGroup, SettingsItem } from "@lunaris/settings";

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
export function readGroup(value: unknown): SettingsGroup | undefined {
  const data = record(value, ["id", "categoryId", "title", "description", "order"]); if (!data) return;
  const base = readCategory({ id: data.id, title: data.title, order: data.order });
  if (!base || !validId(data.categoryId) || (data.description !== undefined && typeof data.description !== "string")) return;
  return Object.freeze({ ...base, categoryId: data.categoryId, ...(data.description === undefined ? {} : { description: data.description as string }) });
}
export const itemKeys = ["title", "description", "layout", "disabled", "error", "retryLabel", "onRetry", "type", "value", "onChange", "options", "placeholder", "min", "max", "step"];
export function readItem(value: unknown): SettingsItem | undefined {
  const input = record(value, ["id", "groupId", "order", ...itemKeys]); if (!input) return;
  let data: Record<string, unknown> = input;
  const base = readCategory({ id: data.id, title: data.title, order: data.order });
  if (!base || !validId(data.groupId) || typeof data.onChange !== "function" ||
      ["description", "error", "retryLabel"].some(key => data[key] !== undefined && typeof data[key] !== "string") ||
      (data.layout !== undefined && data.layout !== "inline" && data.layout !== "stacked") ||
      (data.disabled !== undefined && typeof data.disabled !== "boolean") ||
      ((data.onRetry !== undefined || data.retryLabel !== undefined) && (typeof data.onRetry !== "function" || !validTitle(data.retryLabel)))) return;
  let allowed: string[] = [];
  if (data.type === "select") {
    if (typeof data.value !== "string" || !Array.isArray(data.options) || Object.keys(data.options).length !== data.options.length) return;
    const fields = Object.getOwnPropertyDescriptors(data.options);
    if (Reflect.ownKeys(fields).some(key => typeof key !== "string" || (key !== "length" && (!/^\d+$/.test(key) || !("value" in fields[key]!))))) return;
    const options = Array.from({ length: data.options.length }, (_, index) => record(fields[String(index)]?.value, ["value", "label"]));
    if (options.some(option => !option || typeof option.value !== "string" || !validTitle(option.label)) || new Set(options.map(option => option!.value)).size !== options.length) return;
    data = Object.freeze({ ...data, options: Object.freeze(options) }); allowed = ["options"];
  } else if (data.type === "switch") { if (typeof data.value !== "boolean") return; }
  else if (data.type === "text") { if (typeof data.value !== "string" || (data.placeholder !== undefined && typeof data.placeholder !== "string")) return; allowed = ["placeholder"]; }
  else if (data.type === "number") {
    const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
    if (!finite(data.value) || ["min", "max", "step"].some(key => data[key] !== undefined && !finite(data[key])) ||
        (data.step !== undefined && (data.step as number) <= 0) ||
        (data.min !== undefined && data.max !== undefined && (data.min as number) > (data.max as number)) ||
        (data.min !== undefined && data.value < (data.min as number)) || (data.max !== undefined && data.value > (data.max as number))) return;
    allowed = ["min", "max", "step"];
  } else return;
  if (["options", "placeholder", "min", "max", "step"].some(key => key in data && !allowed.includes(key))) return;
  return Object.freeze({ ...data, ...base }) as unknown as SettingsItem;
}
