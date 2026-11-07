import { ActiveScreen } from "@lunaris/active-screen";
import type { PluginContext } from "@lunaris/sdk";
declare const ctx: PluginContext;
ctx.use(ActiveScreen).select(null);
ctx.use(ActiveScreen).register({ id: "example.screen", componentId: "example.view" }, ctx.signal);
// @ts-expect-error Registration requires an owner.
ctx.use(ActiveScreen).register({ id: "example.screen", componentId: "example.view" });
// @ts-expect-error Selection is a registered ID or null.
ctx.use(ActiveScreen).select(3);
// @ts-expect-error Snapshot lists are immutable.
ctx.use(ActiveScreen).snapshot().screens.push({});
