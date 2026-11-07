import { Settings } from "@lunaris/settings";
import type { PluginContext } from "@lunaris/sdk";
declare const ctx: PluginContext;
ctx.use(Settings).snapshot();
