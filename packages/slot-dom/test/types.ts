import { SlotDom } from "@lunaris/slot-dom";
import type { PluginContext } from "@lunaris/sdk";
declare const ctx: PluginContext;
const target: HTMLElement | undefined = ctx.use(SlotDom).get("test.main");
void target;
// @ts-expect-error Lookup can return no target after ownership cancellation.
const required: HTMLElement = ctx.use(SlotDom).get("test.main");
void required;
