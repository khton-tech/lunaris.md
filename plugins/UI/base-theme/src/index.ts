import { definePlugin } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { Themes } from "@lunaris/themes";
import { baseThemes } from "./themes.js";
import manifest from "../manifest.json" with { type: "json" };

export default definePlugin({ manifest, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal);
  const themes = ctx.use(Themes);
  logger.debug(ctx.pluginId, "Activating base theme engine");
  for (const theme of baseThemes) {
    try {
      const result = themes.register(theme, ctx.signal);
      if (!result.ok) throw new Error("Base theme registration was rejected.", { cause: result.error });
    } catch (error) {
      logger.error(ctx.pluginId, "Cannot register base theme", { code: "BASE_THEME_REGISTRATION_FAILED", data: { themeId: theme.id }, error });
      // Activation rollback aborts ctx.signal, releasing earlier registrations.
      throw error;
    }
  }
  logger.info(ctx.pluginId, "Base theme engine ready", { code: "BASE_THEMES_READY", data: { themeIds: baseThemes.map(theme => theme.id) } });
} });
