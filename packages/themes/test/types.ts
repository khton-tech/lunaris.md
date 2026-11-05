import { Themes, ThemeChanged } from "@lunaris/themes";
import type { ThemeDefinition } from "@lunaris/themes";
import type { PluginContext } from "@lunaris/sdk";
declare const ctx: PluginContext;
const themes = ctx.use(Themes);
const theme: ThemeDefinition = { id: "example.engine.theme", name: "Example", properties: {
  geometry: { panel: { size: 12, unit: "rem" } }, colors: { content: "#eee" }, typography: { family: ["system-ui"] }, custom: true,
} };
themes.register(theme, ctx.signal);
themes.update(theme);
themes.select(theme.id);
themes.select(null);
const current: ThemeDefinition | null = themes.current();
ctx.events.on(ThemeChanged, change => { void change.kind; });
void current;
// @ts-expect-error The engine must supply an ownership signal.
themes.register(theme);
// @ts-expect-error Descriptions contain portable data, not rendering callbacks.
themes.register({ ...theme, properties: { render: () => {} } }, ctx.signal);
// @ts-expect-error Theme properties are deeply readonly.
theme.properties.geometry = {};
// @ts-expect-error Themes contain no DOM operations.
themes.mount("root");
