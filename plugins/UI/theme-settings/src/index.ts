import { definePlugin } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { Config } from "@lunaris/config";
import { Themes } from "@lunaris/themes";
import manifest from "../manifest.json" with { type: "json" };

/** Host policy supplies a fallback ID; no theme engine implementation is imported. */
export function createThemeSettings(options: { readonly defaultThemeId: string }) {
  const fallback = options.defaultThemeId;
  if (typeof fallback !== "string" || fallback.length === 0) throw new TypeError("A default theme ID is required.");
  return definePlugin({ manifest, async activate(ctx) {
    const logger = scopeLogger(ctx.use(Logger), ctx.signal);
    try {
      const themes = ctx.use(Themes);
      const read = await ctx.use(Config).read(ctx.pluginId);
      ctx.signal.throwIfAborted();
      if (!read.ok) throw new Error("Cannot read theme settings.", { cause: read.error });
      const requested = read.value.theme;
      if (requested !== undefined && (typeof requested !== "string" || requested.length === 0)) {
        throw new TypeError("Theme setting must be a nonempty string.");
      }
      let selected = requested ?? fallback;
      if (!themes.get(selected)) {
        logger.warn(ctx.pluginId, "Configured theme is unavailable; using the startup default", { code: "THEME_NOT_FOUND" });
        selected = fallback;
      }
      const result = themes.select(selected);
      if (!result.ok) throw new Error("Cannot select startup theme.", { cause: result.error });
      logger.info(ctx.pluginId, "Startup theme selected", { code: "THEME_SETTINGS_READY", data: { themeId: selected } });
    } catch (error) {
      if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot apply theme settings", { code: "THEME_SETTINGS_FAILED", error });
      throw error;
    }
  } });
}
