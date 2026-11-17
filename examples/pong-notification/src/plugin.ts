import { ApplicationDom } from "@lunaris/components";
import { Localization } from "@lunaris/localization";
import { Logger, scopeLogger } from "@lunaris/logging";
import { Notifications } from "@lunaris/notifications";
import type { NotificationOptions } from "@lunaris/notifications";
import { definePlugin } from "@lunaris/sdk";
import manifest from "../manifest.json" with { type: "json" };

const catalogs = { en: { title: "Notification" }, ru: { title: "Уведомление" } };

export default definePlugin({ manifest, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal);
  const notifications = ctx.use(Notifications);
  const language = ctx.use(Localization);
  const browser = ctx.use(ApplicationDom).root()?.ownerDocument.defaultView;
  if (!browser) {
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

  const localized = language.register(ctx.pluginId, catalogs, ctx.signal);
  if (!localized.ok) throw new Error("Cannot localize Pong notifications.", { cause: localized.error });

  async function pong(input: string | NotificationOptions): Promise<void> {
    ctx.signal.throwIfAborted();
    const options = typeof input === "string" ? { icon: "bell", title: language.text(ctx.pluginId, "title"), text: input } : input;
    const result = await notifications.show(options, ctx.signal);
    if (!result.ok) {
      logger.warn(ctx.pluginId, "Pong notification was not shown", { error: result.error });
      throw new Error(result.error.message, { cause: result.error });
    }
    logger.debug(ctx.pluginId, "Pong notification shown");
  }

  ctx.scope.own({ dispose() {
    if (Object.getOwnPropertyDescriptor(namespace, "pong")?.value === pong) Reflect.deleteProperty(namespace, "pong");
    if (ownsUi && Object.getOwnPropertyDescriptor(exposed, "ui")?.value === namespace && !Reflect.ownKeys(namespace).length) {
      Reflect.deleteProperty(exposed, "ui");
    }
  } });
  if (ownsUi) Object.defineProperty(exposed, "ui", { configurable: true, writable: true, value: namespace });
  Object.defineProperty(namespace, "pong", { configurable: true, value: pong });
  logger.info(ctx.pluginId, "Pong DevTools command ready");
} });
