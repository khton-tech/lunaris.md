import { Startup, StartupChanged } from "@lunaris/startup";
import type { PluginContext } from "@lunaris/sdk";
declare const ctx: PluginContext;
const startup = ctx.use(Startup);
const snapshot = startup.snapshot();
ctx.events.on(StartupChanged, value => { void value.stage; });
// @ts-expect-error Consumers cannot mutate the host snapshot.
snapshot.state = "loaded";
// @ts-expect-error Consumers cannot control startup through the read-only API.
startup.update(snapshot);
// @ts-expect-error Stage names are stable contract identifiers.
ctx.events.emit(StartupChanged, { sequence: 1, state: "loading", stage: "custom" });
