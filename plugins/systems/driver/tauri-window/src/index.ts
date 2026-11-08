import { definePlugin } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { WindowDriver, DriverWindowChanged, windowFailure, validWindowOwner } from "@lunaris/window";
import type { WindowSnapshot, WindowCapabilities, WindowResult } from "@lunaris/window";
import { nativeWindow } from "./native.js";
import type { NativeWindowPort } from "./native.js";
import manifest from "../manifest.json" with { type: "json" };

export function createTauriWindowDriver(port?: NativeWindowPort | null) {
  return definePlugin({ manifest, async activate(ctx) {
    const logger = ctx.use(Logger); const native = port === undefined ? nativeWindow() : port;
    logger.debug(ctx.pluginId, "Activating native window driver");
    let state: WindowSnapshot = Object.freeze({ sequence: 0, title: "Lunaris", focused: true, maximized: false,
      capabilities: Object.freeze({ title: false, minimize: false, maximize: false, close: false, drag: false, customTitlebar: false }) });
    let unlisten: (() => void) | undefined; let publishing = false;
    let refreshTail = Promise.resolve(); let chromeTail = Promise.resolve();
    let lease: { owner: CancellationSignal; release: () => void } | undefined;
    let decorated = true;
    async function refresh(): Promise<void> {
      if (!native || ctx.signal.aborted) return;
      const next = await native.read();
      if (ctx.signal.aborted) return;
      if (JSON.stringify({ ...state, sequence: 0 }) === JSON.stringify({ ...next, sequence: 0 })) return;
      state = Object.freeze({ ...next, capabilities: Object.freeze({ ...next.capabilities }), sequence: state.sequence + 1 });
      if (publishing) await ctx.events.emit(DriverWindowChanged, state);
    }
    function scheduleRefresh(): Promise<void> {
      refreshTail = refreshTail.then(refresh).catch(error => {
        if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot refresh native window state", { error });
      });
      return refreshTail;
    }
    function restore(): void {
      const previous = lease; lease = undefined;
      previous?.owner.removeEventListener("abort", previous.release);
      chromeTail = chromeTail.then(async () => { if (native) await native.setDecorations(decorated); });
      // Keep rejection observed until awaited by scope cleanup or the next acquisition.
      void chromeTail.catch(error => { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot restore native window chrome", { error }); });
    }
    ctx.scope.own({ async dispose() {
      unlisten?.();
      if (lease) restore();
      await chromeTail;
      await refreshTail;
    } });
    if (native) {
      decorated = await native.isDecorated();
      ctx.signal.throwIfAborted();
      const remove = await native.listen(() => { void scheduleRefresh(); });
      if (ctx.signal.aborted) { remove(); return; }
      unlisten = remove;
      await refresh();
      ctx.signal.throwIfAborted();
    } else logger.warn(ctx.pluginId, "Native window controls unavailable; keeping platform chrome");
    async function run(capability: keyof WindowCapabilities, operation: () => Promise<void>): Promise<WindowResult> {
      if (!native || !state.capabilities[capability]) return windowFailure("UNSUPPORTED", "This platform does not support the window operation.");
      try {
        await operation();
        if (!ctx.signal.aborted && capability !== "drag" && capability !== "close") await scheduleRefresh();
        if (!ctx.signal.aborted) logger.debug(ctx.pluginId, "Window operation completed", { data: { operation: capability } });
        return { ok: true, value: null };
      } catch (error) {
        if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Native window operation failed", { data: { operation: capability }, error });
        return windowFailure("NATIVE_FAILED", "The native window operation failed.");
      }
    }
    ctx.provide(WindowDriver, {
      snapshot: () => state,
      setTitle: title => run("title", () => native!.setTitle(title)),
      minimize: () => run("minimize", () => native!.minimize()),
      toggleMaximize: () => run("maximize", () => native!.toggleMaximize()),
      startDragging: () => run("drag", () => native!.startDragging()),
      close: () => run("close", () => native!.close()),
      async acquireTitlebar(owner) {
        if (!validWindowOwner(owner)) return windowFailure("INVALID_ARGUMENT", "A live titlebar owner is required.");
        if (!native || !state.capabilities.customTitlebar) return windowFailure("UNSUPPORTED", "Custom window chrome is unavailable.");
        if (lease) return windowFailure("BUSY", "Custom window chrome already has an owner.");
        lease = { owner, release: restore };
        owner.addEventListener("abort", restore, { once: true });
        // Serialize hide/restore across owner cancellation and replacement.
        const pending = chromeTail.then(() => native.setDecorations(false));
        chromeTail = pending;
        try {
          await pending;
          if (owner.aborted || ctx.signal.aborted) return windowFailure("CANCELLED", "The titlebar owner stopped.");
          logger.info(ctx.pluginId, "Custom window chrome enabled");
          return { ok: true, value: null };
        } catch (error) {
          // A failed hide must not poison future restoration attempts.
          chromeTail = Promise.resolve();
          if (lease?.owner === owner) restore();
          if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot enable custom window chrome", { error });
          return windowFailure("NATIVE_FAILED", "Cannot enable custom window chrome.");
        }
      },
    });
    publishing = true;
    logger.info(ctx.pluginId, "Native window driver ready");
  } });
}
export default createTauriWindowDriver();
