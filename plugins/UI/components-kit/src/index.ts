import { definePlugin } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { Components } from "@lunaris/components";
import { Themes, ThemeChanged } from "@lunaris/themes";
import { mountStartupScreen } from "./startup-screen.js";
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
  const result = components.register({ id: "lunaris.startup-screen", mount(target, props, signal) {
    try {
      let instance: ReturnType<typeof mountStartupScreen> | undefined;
      instance = mountStartupScreen(target, props, signal, () => themes.current(), () => { if (instance) instances.delete(instance); });
      instances.add(instance);
      if (themes.current() === null) logger.warn(ctx.pluginId, "No active theme; inheriting the product surface", { code: "THEME_UNSELECTED" });
      logger.debug(ctx.pluginId, "Startup screen mounted");
      return { update(next) {
        try { instance!.update(next); }
        catch (error) { logger.error(ctx.pluginId, "Cannot update startup screen", { code: "SCREEN_UPDATE_FAILED", error }); throw error; }
      }, dispose: () => instance!.dispose() };
    } catch (error) {
      logger.error(ctx.pluginId, "Cannot mount startup screen", { code: "SCREEN_MOUNT_FAILED", error }); throw error;
    }
  } }, ctx.signal);
  if (!result.ok) {
    logger.error(ctx.pluginId, "Cannot register startup screen", { code: result.error.code });
    throw new Error("Components Kit registration failed.", { cause: result.error });
  }
  logger.info(ctx.pluginId, "Components Kit ready", { code: "COMPONENTS_KIT_READY" });
} });
