import { defineApi } from "@lunaris/sdk";

/** Browser rendering bridge. Keep platform-neutral services independent of it. */
export interface SlotDomApi {
  /** Borrow the target. Do not remove/reparent it or modify its structural styles. */
  get(id: string): HTMLElement | undefined;
}
export const SlotDom = defineApi<SlotDomApi>({
  id: "lunaris.slot-dom", version: "1.0.0", providePermission: "ui.dom", consumePermission: "ui.dom",
  validate: value => value !== null && typeof value === "object" && typeof Object.getOwnPropertyDescriptor(value, "get")?.value === "function",
});
