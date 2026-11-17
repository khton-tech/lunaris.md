import type { PluginContext } from "@lunaris/sdk";
import { DesktopBackground } from "@lunaris/window";

declare const ctx: PluginContext;
const desktop = ctx.use(DesktopBackground);
void desktop.configure(true, { open: "Open Lunaris", quit: "Quit" });
// @ts-expect-error The tray needs both localized labels.
void desktop.configure(true, { quit: "Quit" });
