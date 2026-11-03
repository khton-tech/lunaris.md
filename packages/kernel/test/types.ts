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

import { createKernel } from "@lunaris/kernel";
import type { Kernel, Scheduler } from "@lunaris/kernel";
declare const scheduler: Scheduler;
const kernel: Kernel = createKernel({ scheduler });
const operation: Promise<void> = kernel.stopAll();
const snapshot = kernel.inspect();
// @ts-expect-error A host scheduler is required without platform timer globals.
createKernel();
// @ts-expect-error Inspection must not expose mutable registry state.
snapshot.plugins[0]!.state = "active";
// @ts-expect-error Internal controllers are not host package exports.
import type { OwnedScope } from "@lunaris/kernel/src/scope.js";
void operation;
