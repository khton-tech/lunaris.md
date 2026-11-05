import { Localization, LocaleChanged } from "@lunaris/localization";
import type { PluginContext } from "@lunaris/sdk";
declare const ctx: PluginContext;
const language = ctx.use(Localization);
language.register(ctx.pluginId, { en: { opened: "Opened {count} files" } }, ctx.signal);
const message: string = language.text(ctx.pluginId, "opened", { count: 2 });
ctx.events.on(LocaleChanged, change => { void change.current; });
void message;
// @ts-expect-error English is required for every plugin.
language.register(ctx.pluginId, { fr: { opened: "Ouvert" } }, ctx.signal);
// @ts-expect-error A registration must have an owner.
language.register(ctx.pluginId, { en: { opened: "Opened" } });
// @ts-expect-error Parameters are plain string or number values.
language.text(ctx.pluginId, "opened", { count: {} });
