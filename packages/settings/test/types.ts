import { Settings } from "@lunaris/settings";
import type { PluginContext } from "@lunaris/sdk";
declare const ctx: PluginContext;
ctx.use(Settings).snapshot();
ctx.use(Settings).registerCategory({ id: "example.appearance", title: "Appearance" }, ctx.signal);
ctx.use(Settings).registerSection({ id: "example.controls", categoryId: "example.appearance", title: "Controls", componentId: "example.controls-view" }, ctx.signal);
// @ts-expect-error Registrations require ownership.
ctx.use(Settings).registerCategory({ id: "example.appearance", title: "Appearance" });
// @ts-expect-error Snapshots cannot be mutated.
ctx.use(Settings).snapshot().sections.push({});
// @ts-expect-error The registry is not a value store.
ctx.use(Settings).set("key", true);
ctx.use(Settings).registerGroup({ id: "example.display", categoryId: "example.appearance", title: "Display" }, ctx.signal);
ctx.use(Settings).registerItem({ id: "example.theme", groupId: "example.display", title: "Theme", type: "select", value: "mono", options: [{ value: "mono", label: "Monochrome" }], onChange(value, context) { const id: string = context.vaultId; const selected: string = value; void id; void selected; } }, ctx.signal);
ctx.use(Settings).registerItem({ id: "example.wrap", groupId: "example.display", title: "Wrap", type: "switch", value: true, onChange(value) { const enabled: boolean = value; void enabled; } }, ctx.signal);
// @ts-expect-error Switch values must be boolean.
ctx.use(Settings).registerItem({ id: "example.invalid", groupId: "example.display", title: "Invalid", type: "switch", value: "true", onChange() {} }, ctx.signal);
// @ts-expect-error Select controls require registered options.
ctx.use(Settings).registerItem({ id: "example.invalid", groupId: "example.display", title: "Invalid", type: "select", value: "mono", onChange() {} }, ctx.signal);
