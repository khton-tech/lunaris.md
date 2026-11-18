import type { SidebarAction, SidebarTab } from "@lunaris/sidebar";

const validId = (item: unknown): item is string => typeof item === "string" && /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(item);

function fields(value: unknown, keys?: readonly string[]): PropertyDescriptorMap | undefined {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== "string" || key === "__proto__" || (keys && !keys.includes(key)) || !("value" in descriptors[key]!))) return;
  return descriptors;
}
export function presentation(value: unknown): Pick<Required<SidebarTab>, "title" | "icon" | "props"> | undefined {
  const data = fields(value, ["title", "icon", "props"]); if (!data) return;
  const title: unknown = data.title?.value; const icon: unknown = data.icon?.value;
  const props = fields(data.props?.value === undefined ? {} : data.props.value);
  if (typeof title !== "string" || !title.trim() || typeof icon !== "string" || !icon.trim() || !props || "workspace" in props) return;
  return Object.freeze({ title, icon, props: Object.freeze(Object.fromEntries(Object.entries(props).map(([key, field]) => [key, field.value]))) });
}
export function readTab(value: unknown): Required<SidebarTab> | undefined {
  const data = fields(value, ["id", "title", "icon", "componentId", "order", "props", "placement"]); if (!data) return;
  const id: unknown = data.id?.value; const componentId: unknown = data.componentId?.value; const order: unknown = data.order?.value === undefined ? 0 : data.order.value;
  const placement: unknown = data.placement?.value === undefined ? "start" : data.placement.value;
  const copy = presentation({ title: data.title?.value, icon: data.icon?.value, props: data.props?.value });
  if (!validId(id) || !validId(componentId) || !copy || !Number.isSafeInteger(order) || !["start", "end"].includes(placement as string)) return;
  return Object.freeze({ id, componentId, order: order as number, placement: placement as "start" | "end", ...copy });
}

export function readAction(value: unknown): Required<SidebarAction> | undefined {
  const data = fields(value, ["id", "title", "icon", "placement", "order", "opensDialog", "onPress"]);
  if (!data) return;
  const { id, placement = "start", order = 0, opensDialog = false, onPress } = Object.fromEntries(
    Object.entries(data).map(([key, field]) => [key, field.value]));
  const copy = presentation({ title: data.title?.value, icon: data.icon?.value });
  if (!validId(id) || !copy || !["start", "end"].includes(placement) || !Number.isSafeInteger(order) ||
      typeof opensDialog !== "boolean" || typeof onPress !== "function") return;
  return Object.freeze({ id, title: copy.title, icon: copy.icon, placement, order, opensDialog, onPress });
}
