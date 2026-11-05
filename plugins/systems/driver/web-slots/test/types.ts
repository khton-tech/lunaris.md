import { createWebSlotDriver } from "@lunaris/web-slot-driver";
import type { PluginDefinition } from "@lunaris/sdk";
declare const target: HTMLElement;
const plugin: PluginDefinition = createWebSlotDriver(target);
void plugin;
// @ts-expect-error Only trusted composition provides a DOM target.
createWebSlotDriver("#application-root");
