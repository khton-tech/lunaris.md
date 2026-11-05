import { defineApi } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";

export interface SlotRequest {
  readonly id: string;
  readonly parent?: string;
  readonly direction?: "row" | "column";
  readonly order?: number;
  readonly grow?: number;
}
export interface SlotInfo {
  readonly id: string;
  readonly parent: string | null;
  readonly direction: "row" | "column";
  readonly order: number;
  readonly grow: number;
}
export type SlotErrorCode = "INVALID_ARGUMENT" | "ALREADY_EXISTS" | "PARENT_MISSING" | "DRIVER_FAILED";
export type SlotResult<T> = { readonly ok: true; readonly value: T } | {
  readonly ok: false; readonly error: { readonly code: SlotErrorCode; readonly message: string };
};
export interface SlotsApi {
  create(request: SlotRequest, owner: CancellationSignal): SlotResult<SlotInfo>;
  get(id: string): SlotInfo | undefined;
  /** Direct children, sorted by order with creation order as the tie breaker. */
  list(parent?: string): readonly SlotInfo[];
}
export interface SlotDriverApi {
  /** Owner cancellation removes the target and all descendant targets. */
  create(slot: SlotInfo, owner: CancellationSignal, registry: CancellationSignal): SlotResult<null>;
}
export const ROOT_SLOT: SlotInfo = Object.freeze({ id: "root", parent: null, direction: "column", order: 0, grow: 1 });
const methods = (value: unknown, names: readonly string[]): boolean => value !== null && typeof value === "object" &&
  names.every(name => typeof Object.getOwnPropertyDescriptor(value, name)?.value === "function");
export const Slots = defineApi<SlotsApi>({ id: "lunaris.slots", version: "1.0.0", validate: value => methods(value, ["create", "get", "list"]) });
export const SlotDriver = defineApi<SlotDriverApi>({
  id: "lunaris.slot-driver", version: "1.0.0", providePermission: "ui.surface", consumePermission: "ui.surface",
  validate: value => methods(value, ["create"]),
});
export function slotFailure(code: SlotErrorCode, message: string): SlotResult<never> { return { ok: false, error: { code, message } }; }
/** Normalize plain request data without invoking property getters. */
export function normalizeSlot(value: unknown): SlotInfo | undefined {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return;
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(fields).some(key => !["id", "parent", "direction", "order", "grow"].includes(key) || !("value" in fields[key]!))) return;
  const id: unknown = fields.id?.value;
  const parent: unknown = fields.parent?.value === undefined ? "root" : fields.parent.value;
  const direction: unknown = fields.direction?.value === undefined ? "column" : fields.direction.value;
  const order: unknown = fields.order?.value === undefined ? 0 : fields.order.value;
  const grow: unknown = fields.grow?.value === undefined ? 0 : fields.grow.value;
  if (typeof id !== "string" || !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(id) ||
    typeof parent !== "string" || (parent !== "root" && !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(parent)) ||
    (direction !== "row" && direction !== "column") || typeof order !== "number" || !Number.isSafeInteger(order) ||
    typeof grow !== "number" || !Number.isFinite(grow) || grow < 0) return;
  return Object.freeze({ id, parent, direction, order, grow });
}
export function isLiveOwner(value: CancellationSignal): boolean {
  return !!value && value.aborted === false && typeof value.addEventListener === "function" && typeof value.removeEventListener === "function";
}
