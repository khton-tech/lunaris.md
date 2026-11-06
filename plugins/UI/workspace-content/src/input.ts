import type { WorkspaceContent, WorkspaceProps } from "@lunaris/workspace";

export function readProps(value: unknown): WorkspaceProps | undefined {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return;
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).some(key => typeof key !== "string" || ["workspace", "__proto__"].includes(key) || !("value" in fields[key]!))) return;
  return Object.freeze(Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value])));
}
export function readContent(value: unknown): Required<WorkspaceContent> | undefined {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return;
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).some(key => typeof key !== "string" || !["id", "componentId", "props", "order"].includes(key) || !("value" in fields[key]!))) return;
  const id: unknown = fields.id?.value; const componentId: unknown = fields.componentId?.value;
  const order: unknown = fields.order?.value === undefined ? 0 : fields.order.value;
  const props = readProps(fields.props?.value === undefined ? {} : fields.props.value);
  const validId = (item: unknown): item is string => typeof item === "string" && /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(item);
  if (!validId(id) || !validId(componentId) || typeof order !== "number" || !Number.isSafeInteger(order) || !props) return;
  return Object.freeze({ id, componentId, order, props });
}
