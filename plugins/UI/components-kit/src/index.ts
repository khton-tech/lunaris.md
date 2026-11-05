import { definePlugin } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { Components } from "@lunaris/components";
import { Themes, ThemeChanged } from "@lunaris/themes";
import { mountStartupScreen } from "./startup-screen.js";
import { mountVaultSelector } from "./vault-selector.js";
import manifest from "../manifest.json" with { type: "json" };

export default definePlugin({ manifest, activate(ctx) {
  const logger = ctx.use(Logger);
  const components = ctx.use(Components);
  const themes = ctx.use(Themes);
  const instances = new Set<ReturnType<typeof mountStartupScreen>>();
  ctx.events.on(ThemeChanged, () => {
    try { for (const instance of instances) instance.applyTheme(); }
    catch (error) { logger.error(ctx.pluginId, "Cannot apply active theme", { code: "SCREEN_THEME_FAILED", error }); throw error; }
  });
  for (const [id, mount] of [["lunaris.startup-screen", mountStartupScreen], ["lunaris.vault-selector", mountVaultSelector]] as const) {
    const result = components.register({ id, mount(target, props, signal) {
      try {
        let instance: ReturnType<typeof mountStartupScreen> | undefined;
        instance = mount(target, props, signal, () => themes.current(), () => { if (instance) instances.delete(instance); });
        instances.add(instance);
        if (themes.current() === null) logger.warn(ctx.pluginId, "No active theme; inheriting the product surface", { code: "THEME_UNSELECTED" });
        logger.debug(ctx.pluginId, "Component mounted", { data: { componentId: id } });
        return { update(next) {
          try { instance!.update(next); }
          catch (error) { logger.error(ctx.pluginId, "Cannot update component", { code: "SCREEN_UPDATE_FAILED", data: { componentId: id }, error }); throw error; }
        }, dispose: () => instance!.dispose() };
      } catch (error) {
        logger.error(ctx.pluginId, "Cannot mount component", { code: "SCREEN_MOUNT_FAILED", data: { componentId: id }, error }); throw error;
      }
    } }, ctx.signal);
    if (!result.ok) {
      logger.error(ctx.pluginId, "Cannot register component", { code: result.error.code, data: { componentId: id } });
      throw new Error("Components Kit registration failed.", { cause: result.error });
    }
  }
  logger.info(ctx.pluginId, "Components Kit ready", { code: "COMPONENTS_KIT_READY" });
} });
