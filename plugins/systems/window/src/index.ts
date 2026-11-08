import { definePlugin, LunarisError } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { Window, WindowDriver, WindowChanged, DriverWindowChanged, windowFailure, validWindowOwner } from "@lunaris/window";
import manifest from "../manifest.json" with { type: "json" };

export default definePlugin({ manifest, activate(ctx) {
  const logger = ctx.use(Logger); const driver = ctx.use(WindowDriver);
  logger.debug(ctx.pluginId, "Activating window provider");
  ctx.events.on(DriverWindowChanged, async snapshot => {
    try { if (!ctx.signal.aborted) await ctx.events.emit(WindowChanged, snapshot); }
    catch (error) {
      // Shutdown may reserve the endpoint before its cancellation signal fires.
      if (ctx.signal.aborted || (error instanceof LunarisError && ["SCOPE_CLOSED", "CONTRACT_UNAVAILABLE", "PROVIDER_UNAVAILABLE"].includes(error.code))) return;
      logger.error(ctx.pluginId, "Cannot publish window state", { error });
    }
  });
  ctx.provide(Window, {
    snapshot: () => driver.snapshot(),
    setTitle(title) {
      if (typeof title !== "string" || !title.trim() || title.length > 1024 || /[\u0000-\u001f]/u.test(title)) {
        logger.warn(ctx.pluginId, "Invalid window title rejected");
        return Promise.resolve(windowFailure("INVALID_ARGUMENT", "A nonempty, single-line title of at most 1024 characters is required."));
      }
      return driver.setTitle(title);
    },
    minimize: () => driver.minimize(),
    toggleMaximize: () => driver.toggleMaximize(),
    startDragging: () => driver.startDragging(),
    close: () => driver.close(),
    acquireTitlebar(owner) {
      if (!validWindowOwner(owner)) return Promise.resolve(windowFailure("INVALID_ARGUMENT", "A live titlebar owner is required."));
      return driver.acquireTitlebar(owner);
    },
  });
  logger.info(ctx.pluginId, "Window provider ready");
} });
