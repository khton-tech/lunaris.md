import { russian } from "./locales/ru.js";
import { definePlugin } from "@lunaris/sdk";
import type { ResourceScope } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { Window, WindowChanged } from "@lunaris/window";
import type { WindowResult } from "@lunaris/window";
import { Slots } from "@lunaris/slots";
import { SlotDom } from "@lunaris/slot-dom";
import { Components, ComponentsChanged } from "@lunaris/components";
import type { MountedComponent } from "@lunaris/components";
import { Localization, LocaleChanged } from "@lunaris/localization";
import manifest from "../manifest.json" with { type: "json" };

const role = "lunaris.window-titlebar";
interface View { readonly owner: ResourceScope; mounted?: MountedComponent; }

export default definePlugin({ manifest, async activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal); const window = ctx.use(Window);
  const slots = ctx.use(Slots); const targets = ctx.use(SlotDom); const components = ctx.use(Components);
  const localization = ctx.use(Localization);
  logger.debug(ctx.pluginId, "Activating window titlebar");
  const registered = localization.register(ctx.pluginId, { en: {
    minimize: "Minimize", maximize: "Maximize", restore: "Restore", close: "Close",
  }, ru: russian }, ctx.signal);
  if (!registered.ok) throw new Error("Cannot register titlebar messages.", { cause: registered.error });
  let state = window.snapshot(); let view: View | undefined; let acquiring = Promise.resolve();
  function release(): void {
    const previous = view; view = undefined;
    // Native restoration belongs to the driver; cleanup never calls closed SDK handles.
    if (previous) void previous.owner.dispose().catch(() => {});
  }
  function action(operation: () => Promise<WindowResult>): void {
    if (ctx.signal.aborted) return;
    try {
      void operation().then(result => {
        if (!ctx.signal.aborted && !result.ok) logger.warn(ctx.pluginId, "Window action declined", { code: result.error.code });
      }).catch(error => { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot invoke window action", { error }); });
    } catch (error) { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot invoke window action", { error }); }
  }
  function props() {
    const text = (key: string) => localization.text(ctx.pluginId, key);
    return { title: state.title || "Lunaris", focused: state.focused, maximized: state.maximized,
      canMinimize: state.capabilities.minimize, canMaximize: state.capabilities.maximize,
      canClose: state.capabilities.close, canDrag: state.capabilities.drag,
      minimizeLabel: text("minimize"), maximizeLabel: text("maximize"), restoreLabel: text("restore"), closeLabel: text("close"),
      onMinimize: () => action(() => window.minimize()), onToggleMaximize: () => action(() => window.toggleMaximize()),
      onClose: () => action(() => window.close()), onDrag: () => action(() => window.startDragging()),
      presentation: { mode: "standalone", sizing: "content" },
    };
  }
  function refresh(): void {
    if (ctx.signal.aborted) return;
    if (!state.capabilities.customTitlebar || !components.has(role)) { release(); return; }
    try {
      if (view?.mounted) {
        const result = view.mounted.update(props());
        if (result.ok) return;
        throw new Error("Cannot update titlebar.", { cause: result.error });
      }
      const owner = ctx.scope.child(); view = { owner };
      const allocated = slots.create({ id: `${ctx.pluginId}.caption`, order: -100, grow: 0 }, owner.signal);
      if (!allocated.ok) throw new Error("Cannot allocate titlebar slot.", { cause: allocated.error });
      const target = targets.get(allocated.value.id);
      if (!target) throw new Error("Titlebar target is unavailable.");
      const mounted = components.mount(role, target, props(), owner.signal);
      if (!mounted.ok) throw new Error("Cannot mount titlebar.", { cause: mounted.error });
      view.mounted = mounted.value;
      const current = view;
      acquiring = (async () => {
        try {
          const result = await window.acquireTitlebar(owner.signal);
          if (ctx.signal.aborted || view !== current) return;
          if (!result.ok) {
            release(); logger.warn(ctx.pluginId, "Keeping native titlebar", { code: result.error.code });
          } else logger.info(ctx.pluginId, "Custom titlebar ready");
        } catch (error) {
          if (!ctx.signal.aborted && view === current) { release(); logger.error(ctx.pluginId, "Cannot acquire custom titlebar; keeping native chrome", { error }); }
        }
      })();
    } catch (error) {
      release(); logger.error(ctx.pluginId, "Cannot render custom titlebar; keeping native chrome", { error });
    }
  }
  ctx.scope.own({ dispose: release });
  ctx.events.on(WindowChanged, next => { if (next.sequence <= state.sequence) return; state = next; refresh(); });
  ctx.events.on(LocaleChanged, refresh);
  ctx.events.on(ComponentsChanged, change => {
    if (change.componentId !== role) return;
    if (change.kind === "removed") { release(); logger.warn(ctx.pluginId, "Titlebar renderer unavailable; restoring native chrome"); }
    else refresh();
  });
  // Capture after subscribing so late activation observes the newest window state.
  state = window.snapshot(); refresh(); await acquiring;
  if (!ctx.signal.aborted && !view) logger.warn(ctx.pluginId, "Custom titlebar unavailable; native chrome retained");
} });
