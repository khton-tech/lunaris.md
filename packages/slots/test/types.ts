import { Slots, SlotDriver } from "@lunaris/slots";
import type { PluginContext } from "@lunaris/sdk";
declare const ctx: PluginContext;
const slots = ctx.use(Slots);
const result = slots.create({ id: "test.main", direction: "row", grow: 1 }, ctx.signal);
if (result.ok) {
  const parent: string | null = result.value.parent;
  void parent;
  // @ts-expect-error Slot metadata is immutable.
  result.value.order = 2;
}
// @ts-expect-error Ownership is mandatory.
slots.create({ id: "test.main" });
// @ts-expect-error Only row/column directions are supported.
slots.create({ id: "test.main", direction: "grid" }, ctx.signal);
// @ts-expect-error DOM targets do not belong to the portable registry.
slots.element("test.main");
// @ts-expect-error A renderer must track the registry lifetime too.
ctx.use(SlotDriver).create({ id: "test.main", parent: "root", direction: "row", order: 0, grow: 1 }, ctx.signal);
