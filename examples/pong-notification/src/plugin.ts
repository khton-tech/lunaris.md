import { ApplicationDom, Views } from "@lunaris/components";
import { Localization } from "@lunaris/localization";
import { Logger, scopeLogger } from "@lunaris/logging";
import { definePlugin } from "@lunaris/sdk";
import { ExternalWindows } from "@lunaris/window/external";
import type { ExternalWindow } from "@lunaris/window/external";
import manifest from "../manifest.json" with { type: "json" };

const duration = 4000;
const presentation = { mode: "standalone", sizing: "fill" } as const;
const catalogs = { en: { title: "Notification" }, ru: { title: "Уведомление" } };

export default definePlugin({ manifest, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal);
  const windows = ctx.use(ExternalWindows);
  const language = ctx.use(Localization);
  const views = ctx.use(Views);
  const browser = ctx.use(ApplicationDom).root()?.ownerDocument.defaultView;
  if (!browser || !windows.supported()) {
    logger.warn(ctx.pluginId, "Native Pong notifications are unavailable");
    throw new Error("Pong notifications require the Lunaris desktop host.");
  }

  const exposed = browser as typeof browser & { ui?: unknown };
  const ownsUi = !("ui" in exposed);
  const namespace = ownsUi ? {} : exposed.ui;
  if (!namespace || typeof namespace !== "object" || "pong" in namespace || !Object.isExtensible(namespace)) {
    logger.warn(ctx.pluginId, "The ui.pong DevTools entry is occupied");
    throw new Error("Cannot register ui.pong in DevTools.");
  }

  const componentId = `${ctx.pluginId}.message`;
  const localized = language.register(ctx.pluginId, catalogs, ctx.signal);
  if (!localized.ok) throw new Error("Cannot localize Pong notifications.", { cause: localized.error });
  const registered = views.register({ id: componentId, render(props) {
    if (typeof props.text !== "string") throw new TypeError("Pong view requires text.");
    return { kind: "text", text: props.text };
  } }, ctx.signal);
  if (!registered.ok) throw new Error("Cannot register the Pong notification view.", { cause: registered.error });

  let pending = Promise.resolve();
  let displayed: ExternalWindow | undefined;
  let timer: number | undefined;
  const clearExpiry = () => {
    if (timer !== undefined) exposed.clearTimeout(timer);
    timer = undefined;
  };
  const queue = (run: () => Promise<void>) => {
    const task = pending.then(run);
    pending = task.catch(error => { logger.error(ctx.pluginId, "Pong notification failed", { error }); });
    return task;
  };

  function expire(window: ExternalWindow): void {
    clearExpiry();
    const expiry = exposed.setTimeout(() => {
      void queue(async () => {
        if (ctx.signal.aborted || expiry !== timer || displayed !== window) return;
        timer = undefined;
        const result = await window.close();
        if (!result.ok) throw new Error("Cannot close the Pong notification.", { cause: result.error });
      });
    }, duration);
    timer = expiry;
  }

  async function pong(text: unknown): Promise<void> {
    if (typeof text !== "string" || !text.trim() || text.length > 4096) {
      throw new TypeError("ui.pong expects a nonempty string of at most 4096 characters.");
    }
    await queue(async () => {
      ctx.signal.throwIfAborted();
      const props = { text, presentation };
      if (displayed) {
        const result = displayed.update(props);
        if (result.ok) {
          expire(displayed);
          logger.debug(ctx.pluginId, "Pong notification updated");
          return;
        }
        if (result.error.code !== "CANCELLED") throw new Error("Cannot update the Pong notification.", { cause: result.error });
      }
      const result = await windows.open({
        componentId, props, title: language.text(ctx.pluginId, "title"),
        size: { width: 360, height: 112 }, position: "bottom-right", layer: "top", focusable: false, skipTaskbar: true,
      }, ctx.signal);
      if (ctx.signal.aborted) return;
      if (!result.ok) throw new Error("Cannot open the Pong notification.", { cause: result.error });
      const window = result.value;
      displayed = window;
      void window.closed.then(() => {
        if (displayed !== window) return;
        displayed = undefined;
        clearExpiry();
      });
      expire(window);
      logger.info(ctx.pluginId, "Pong notification shown");
    });
  }

  ctx.scope.own({ dispose() {
    clearExpiry();
    if (Object.getOwnPropertyDescriptor(namespace, "pong")?.value === pong) Reflect.deleteProperty(namespace, "pong");
    if (ownsUi && Object.getOwnPropertyDescriptor(exposed, "ui")?.value === namespace && !Reflect.ownKeys(namespace).length) {
      Reflect.deleteProperty(exposed, "ui");
    }
  } });
  if (ownsUi) Object.defineProperty(exposed, "ui", { configurable: true, writable: true, value: namespace });
  Object.defineProperty(namespace, "pong", { configurable: true, value: pong });
  logger.info(ctx.pluginId, "Pong DevTools command ready");
} });
