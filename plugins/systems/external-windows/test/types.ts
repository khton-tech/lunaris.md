import type { PluginContext } from "@lunaris/sdk";
import { ExternalWindows } from "@lunaris/window/external";

declare const ctx: PluginContext;
const options = { title: "Local title", size: { width: 320, height: 200 }, componentId: "example.component" };
async function launch() {
  const result = await ctx.use(ExternalWindows).open(options, ctx.signal);
  if (result.ok) {
    result.value.update({ value: 2 });
    await result.value.hide();
    await result.value.close();
    await result.value.closed;
  }
  // @ts-expect-error The window must be owned by a live signal.
  await ctx.use(ExternalWindows).open(options);
}
void launch;
