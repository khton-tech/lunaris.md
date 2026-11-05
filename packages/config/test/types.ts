import { Config, ConfigChanged } from "@lunaris/config";
import type { ConfigResult, ConfigTable } from "@lunaris/config";
import type { PluginContext } from "@lunaris/sdk";
declare const ctx: PluginContext;
const config = ctx.use(Config);
const section: Promise<ConfigResult<ConfigTable>> = config.read(ctx.pluginId);
void section;
void config.set("other.plugin", "enabled", false, { scope: "vault", vaultId: "v" });
void config.set(ctx.pluginId, "nested", { size: 0, values: ["one", 2] }, { scope: "global" });
ctx.events.on(ConfigChanged, change => { void change.pluginId; });
// @ts-expect-error A write must identify its storage layer.
config.set(ctx.pluginId, "theme", "dark");
// @ts-expect-error Effective configuration is read-only.
config.set(ctx.pluginId, "theme", "dark", { scope: "effective" });
// @ts-expect-error Null is not a TOML value; remove a key explicitly.
config.set(ctx.pluginId, "theme", null, { scope: "global" });
