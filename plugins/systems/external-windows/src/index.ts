import { Components } from "@lunaris/components";
import { Logger, scopeLogger } from "@lunaris/logging";
import { definePlugin } from "@lunaris/sdk";
import { validWindowOwner, windowFailure } from "@lunaris/window";
import { ExternalWindows, ExternalWindowDriver, validWindowPosition, validWindowSize } from "@lunaris/window/external";
import type { ExternalWindow, ExternalWindowOptions } from "@lunaris/window/external";
import manifest from "../manifest.json" with { type: "json" };

function validOptions(options: ExternalWindowOptions): boolean {
  return !!options && typeof options.title === "string" && !!options.title.trim() && options.title.length <= 1024 &&
    !/[\u0000-\u001f]/u.test(options.title) && typeof options.componentId === "string" &&
    validWindowSize(options.size) && (options.position === undefined || validWindowPosition(options.position)) &&
    [options.visible, options.alwaysOnTop, options.skipTaskbar, options.focusable].every(value => value === undefined || typeof value === "boolean");
}

export default definePlugin({ manifest, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal);
  const driver = ctx.use(ExternalWindowDriver);
  const components = ctx.use(Components);
  const owner = new AbortController();
  ctx.signal.addEventListener("abort", () => owner.abort(), { once: true });

  ctx.provide(ExternalWindows, {
    supported: () => driver.supported(),
    async open(options, caller) {
      if (!validWindowOwner(caller) || !validOptions(options)) {
        return windowFailure("INVALID_ARGUMENT", "External windows require valid options and a live owner.");
      }
      const { componentId, props = {}, visible = true, ...native } = options;
      if (!components.has(componentId)) return windowFailure("INVALID_ARGUMENT", "The external window component is not registered.");
      const signal = new AbortController();
      const cancel = () => signal.abort();
      caller.addEventListener("abort", cancel, { once: true });
      owner.signal.addEventListener("abort", cancel, { once: true });
      const release = () => {
        caller.removeEventListener("abort", cancel);
        owner.signal.removeEventListener("abort", cancel);
      };
      try {
        const created = await driver.open(native, signal.signal);
        if (!created.ok) { release(); return created; }
        const surface = created.value;
        void surface.closed.then(release);
        if (surface.signal.aborted || signal.signal.aborted) return windowFailure("CANCELLED", "The window owner stopped.");

        try {
          const mounted = components.mount(componentId, surface.target, props, surface.signal);
          if (!mounted.ok) throw new Error("Cannot mount the external window component.", { cause: mounted.error });
          if (visible) {
            const shown = await surface.show();
            if (!shown.ok) { await surface.close(); return shown; }
          }
          if (surface.signal.aborted) return windowFailure("CANCELLED", "The external window closed while opening.");
          const handle: ExternalWindow = {
            closed: surface.closed, close: surface.close, show: surface.show, hide: surface.hide, move: surface.move, resize: surface.resize,
            update(next) {
              if (surface.signal.aborted) return windowFailure("CANCELLED", "The external window is closed.");
              const result = mounted.value.update(next);
              if (result.ok) return result;
              logger.error(ctx.pluginId, "Cannot update external window content", { data: { componentId }, error: result.error });
              return windowFailure("NATIVE_FAILED", "Cannot update the external window component.");
            },
          };
          logger.info(ctx.pluginId, "External window opened", { data: { componentId } });
          void surface.closed.then(() => logger.info(ctx.pluginId, "External window closed", { data: { componentId } }));
          return { ok: true, value: Object.freeze(handle) };
        } catch (error) {
          await surface.close();
          if (signal.signal.aborted) return windowFailure("CANCELLED", "The window owner stopped.");
          logger.error(ctx.pluginId, "Cannot mount external window content", { data: { componentId }, error });
          return windowFailure("NATIVE_FAILED", "Cannot mount the external window component.");
        }
      } catch (error) {
        release();
        if (signal.signal.aborted) return windowFailure("CANCELLED", "The window owner stopped.");
        logger.error(ctx.pluginId, "External window driver failed", { data: { componentId }, error });
        return windowFailure("NATIVE_FAILED", "Cannot open the external window.");
      }
    },
  });
  logger.info(ctx.pluginId, "External window manager ready", { data: { supported: driver.supported() } });
} });
