import { createRunner } from "@lunaris/runner";
import type { PluginDefinition } from "@lunaris/sdk";
const runner: PluginDefinition = createRunner({ art: "LUNARIS" });
void runner;
// @ts-expect-error The host must supply artwork without plugin filesystem access.
createRunner({});
