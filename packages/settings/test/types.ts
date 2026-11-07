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
