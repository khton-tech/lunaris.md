import { Components } from "@lunaris/components";
import { Logger, scopeLogger } from "@lunaris/logging";
import { definePlugin } from "@lunaris/sdk";
import { validWindowOwner, windowFailure } from "@lunaris/window";
import type { WindowResult } from "@lunaris/window";
import { ExternalWindows, ExternalWindowDriver, validExternalWindowPosition, validWindowLayer, validWindowSize } from "@lunaris/window/external";
import type { ExternalWindow, ExternalWindowOptions, ExternalWindowSurface } from "@lunaris/window/external";
import type { CancellationSignal } from "@lunaris/sdk";
import manifest from "../manifest.json" with { type: "json" };

function validOptions(options: ExternalWindowOptions): boolean {
  return !!options && typeof options.title === "string" && !!options.title.trim() && options.title.length <= 1024 &&
    !/[\u0000-\u001f]/u.test(options.title) && typeof options.componentId === "string" &&
    validWindowSize(options.size) && (options.position === undefined || validExternalWindowPosition(options.position)) &&
    (options.layer === undefined || validWindowLayer(options.layer)) &&
    [options.visible, options.alwaysOnTop, options.skipTaskbar, options.focusable].every(value => value === undefined || typeof value === "boolean");
}

export default definePlugin({ manifest, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal);
  const driver = ctx.use(ExternalWindowDriver);
  const components = ctx.use(Components);
  const owner = new AbortController();
  const openings = new Set<Promise<WindowResult<ExternalWindow>>>();
  const surfaces = new Set<ExternalWindowSurface>();
  ctx.signal.addEventListener("abort", () => owner.abort(), { once: true });
  ctx.scope.own({ async dispose() {
    await Promise.allSettled(openings);
    const results = await Promise.allSettled([...surfaces].map(async surface => {
      const result = await surface.close();
      if (!result.ok) throw new Error("Cannot release an external window.", { cause: result.error });
    }));
    const failures = results.flatMap(result => result.status === "rejected" ? [result.reason] : []);
    if (failures.length) throw new AggregateError(failures, "Cannot release all external windows.");
  } });

  async function open(options: ExternalWindowOptions, caller: CancellationSignal): Promise<WindowResult<ExternalWindow>> {
    if (!validWindowOwner(caller) || !validOptions(options)) {
      return windowFailure("INVALID_ARGUMENT", "External windows require valid options and a live owner.");
    }
    if (owner.signal.aborted) return windowFailure("CANCELLED", "The window manager stopped.");
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

    let created: WindowResult<ExternalWindowSurface>;
    try { created = await driver.open(native, signal.signal); }
    catch (error) {
      release();
      if (signal.signal.aborted) return windowFailure("CANCELLED", "The window owner stopped.");
      logger.error(ctx.pluginId, "External window driver failed", { data: { componentId }, error });
      return windowFailure("NATIVE_FAILED", "Cannot open the external window.");
    }
    if (!created.ok) { release(); return created; }

    const surface = created.value;
    surfaces.add(surface);
    let handedOff = false;
    void surface.closed.then(() => {
      surfaces.delete(surface);
      release();
      if (handedOff) logger.debug(ctx.pluginId, "External window closed", { data: { componentId } });
    });
    try {
      if (surface.signal.aborted || signal.signal.aborted) return windowFailure("CANCELLED", "The window owner stopped.");
      const mounted = components.mount(componentId, surface.target, props, surface.signal);
      if (!mounted.ok) throw new Error("Cannot mount the external window component.", { cause: mounted.error });
      if (visible) {
        const shown = await surface.show();
        if (!shown.ok) return shown;
      }
      if (surface.signal.aborted || signal.signal.aborted) return windowFailure("CANCELLED", "The external window closed while opening.");
      const handle: ExternalWindow = {
        closed: surface.closed, close: () => surface.close(), show: () => surface.show(), hide: () => surface.hide(),
        move: position => surface.move(position), resize: size => surface.resize(size),
        update(next) {
          if (surface.signal.aborted) return windowFailure("CANCELLED", "The external window is closed.");
          const result = mounted.value.update(next);
          if (result.ok) return result;
          logger.error(ctx.pluginId, "Cannot update external window content", { data: { componentId }, error: result.error });
          return windowFailure("NATIVE_FAILED", "Cannot update the external window component.");
        },
      };
      handedOff = true;
      logger.debug(ctx.pluginId, "External window opened", { data: { componentId } });
      return { ok: true, value: Object.freeze(handle) };
    } catch (error) {
      if (signal.signal.aborted) return windowFailure("CANCELLED", "The window owner stopped.");
      logger.error(ctx.pluginId, "Cannot mount or show external window content", { data: { componentId }, error });
      return windowFailure("NATIVE_FAILED", "Cannot display the external window component.");
    } finally {
      if (!handedOff && surfaces.has(surface)) {
        try {
          const closed = await surface.close();
          if (!closed.ok) throw new Error("Cannot close an incomplete external window.", { cause: closed.error });
        } catch (error) {
          signal.abort();
          logger.error(ctx.pluginId, "Cannot release an incomplete external window", { data: { componentId }, error });
        }
      }
    }
  }

  ctx.provide(ExternalWindows, {
    supported: () => driver.supported(),
    open(options, caller) {
      const result = open(options, caller);
      openings.add(result);
      const settle = () => { openings.delete(result); };
      void result.then(settle, settle);
      return result;
    },
  });
  logger.info(ctx.pluginId, "External window manager ready", { data: { supported: driver.supported() } });
} });
