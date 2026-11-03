import { run, createPlugin } from "@lunaris/cli";
const code: number = await run(["--help"]);
const root: string = await createPlugin("plugin");
// @ts-expect-error CLI internals cannot be imported through private package paths.
import "@lunaris/cli/src/generate.js";
void [code, root];
