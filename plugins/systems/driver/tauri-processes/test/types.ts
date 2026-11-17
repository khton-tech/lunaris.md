import { NativeProcesses } from "@lunaris/execution";
import type { NativeProcess } from "@lunaris/execution";
import type { PluginContext } from "@lunaris/sdk";

declare const ctx: PluginContext;
const helper: Promise<NativeProcess> = ctx.use(NativeProcesses).start(ctx, {
  executable: "assets/helper.exe",
  args: ["--run"],
  onLine(line) { void line.length; },
});
void helper.then(process => process.write("command"));
// @ts-expect-error Arguments remain separate text values.
ctx.use(NativeProcesses).start(ctx, { executable: "assets/helper.exe", args: "--run" });
