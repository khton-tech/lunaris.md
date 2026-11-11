import type { ScreenDefinition } from "@lunaris/active-screen";

export function readProps(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return;
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).some(key => typeof key !== "string" || ["workspace", "__proto__"].includes(key) || !("value" in fields[key]!))) return;
  return Object.freeze(Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value])));
}
export function readScreen(value: unknown): ScreenDefinition | undefined {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return;
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).some(key => typeof key !== "string" || !["id", "componentId", "props", "document"].includes(key) || !("value" in fields[key]!))) return;
  const id: unknown = fields.id?.value; const componentId: unknown = fields.componentId?.value;
  const document: unknown = fields.document?.value;
  const validId = (item: unknown): item is string => typeof item === "string" && /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(item);
  const props = readProps(fields.props?.value === undefined ? {} : fields.props.value);
  if (!validId(id) || !validId(componentId) || !props || (document !== undefined && document !== true)) return;
  return Object.freeze({ id, componentId, props, ...(document ? { document } : {}) });
}
