import type { PluginState } from "@lunaris/kernel";
// @ts-expect-error Private package paths must not resolve.
import type { PluginState as PrivateState } from "@lunaris/kernel/src/index.js";

const state: PluginState = "registered";
// @ts-expect-error Undocumented lifecycle states must fail compilation.
const invalid: PluginState = "running";
// @ts-expect-error Core checks do not silently acquire Node globals.
process.exit(0);
// @ts-expect-error Core checks do not silently acquire DOM globals.
window.close();
void state;
void invalid;
