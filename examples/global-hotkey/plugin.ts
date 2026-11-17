import { NativeProcesses } from "@lunaris/execution";
import { Logger, scopeLogger } from "@lunaris/logging";
import { definePlugin } from "@lunaris/sdk";
import manifest from "../manifest.json" with { type: "json" };
import { GlobalHotkeyPressed } from "./contract.js";

export default definePlugin({ manifest, async activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal);
  const processes = ctx.use(NativeProcesses);
  let registered = false;
  let settle: (failure: Error | null) => void = () => {};
  const registration = new Promise<Error | null>(resolve => { settle = resolve; });

  try {
    const helper = await processes.start(ctx, { executable: "assets/bin/hotkey.exe", args: [], onLine(line) {
      if (ctx.signal.aborted) return;
      if (line === "ready") {
        settle(null);
      } else if (line.startsWith("error:")) {
        const error = new Error(`Win32 hotkey helper failed (${line.slice("error:".length)}).`);
        if (registered) logger.error(ctx.pluginId, "Global hotkey stopped", { error });
        else settle(error);
      } else if (line === "pressed" && registered) {
        logger.info(ctx.pluginId, "Global hotkey pressed");
        void ctx.events.emit(GlobalHotkeyPressed, { shortcut: "Ctrl+Alt+Shift+H" })
          .catch(error => logger.warn(ctx.pluginId, "Could not deliver global hotkey event", { error }));
      }
    } });
    const stopped = helper.wait().then(code => {
      const error = new Error(`Hotkey helper exited (${code ?? "terminated"}).`);
      if (registered) logger.warn(ctx.pluginId, "Global hotkey is unavailable", { error });
      return error;
    }, error => {
      if (registered) logger.error(ctx.pluginId, "Cannot watch global hotkey helper", { error });
      return error instanceof Error ? error : new Error("Cannot watch hotkey helper.", { cause: error });
    });
    const failure = await Promise.race([registration, stopped]);
    ctx.signal.throwIfAborted();
    if (failure) throw failure;
    registered = true;
    logger.info(ctx.pluginId, "Global hotkey registered", { data: { shortcut: "Ctrl+Alt+Shift+H" } });
  } catch (error) {
    logger.error(ctx.pluginId, "Cannot register global hotkey", { error });
    throw error;
  }
} });
