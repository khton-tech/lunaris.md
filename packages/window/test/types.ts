import { Window } from "@lunaris/window";
import type { PluginContext } from "@lunaris/sdk";
declare const ctx: PluginContext;
ctx.use(Window).setTitle("Lunaris");
ctx.use(Window).acquireTitlebar(ctx.signal);
// @ts-expect-error A title must be text.
ctx.use(Window).setTitle(3);
// @ts-expect-error Chrome requires an owner.
ctx.use(Window).acquireTitlebar();
