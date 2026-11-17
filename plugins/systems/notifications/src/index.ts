import { Logger, scopeLogger } from "@lunaris/logging";
import { NotificationRole, Notifications, readNotificationOptions } from "@lunaris/notifications";
import type { NotificationErrorCode, NotificationOptions, NotificationResult } from "@lunaris/notifications";
import { definePlugin } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";
import { validWindowOwner } from "@lunaris/window";
import { ExternalWindows } from "@lunaris/window/external";
import type { ExternalWindow } from "@lunaris/window/external";
import manifest from "../manifest.json" with { type: "json" };

interface Request {
  readonly options: NotificationOptions;
  readonly lifetime: AbortController;
  resolve(result: NotificationResult): void;
  release(): void;
}

const maxWaiting = 32;
const shown = { ok: true, value: null } as const;
const failure = (code: NotificationErrorCode, message: string): NotificationResult => ({ ok: false, error: { code, message } });
const cancelled = () => failure("CANCELLED", "The notification owner stopped.");

function waitForDismissal(window: ExternalWindow, signal: CancellationSignal, duration: number): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(finish, duration);
    function finish(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    }
    signal.addEventListener("abort", finish, { once: true });
    void window.closed.then(finish);
  });
}

export default definePlugin({ manifest, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal);
  const windows = ctx.use(ExternalWindows);
  const waiting: Request[] = [];
  let current: Request | undefined;
  let worker: Promise<void> | undefined;

  async function display(request: Request): Promise<void> {
    const { icon, title, text } = request.options;
    const signal = request.lifetime.signal;
    if (signal.aborted) { request.resolve(cancelled()); return; }
    try {
      const window = await windows.open({
        title, componentId: NotificationRole,
        props: { icon, title, text, presentation: { mode: "standalone", sizing: "fill" } },
        size: { width: 384, height: 128 }, position: "bottom-right", layer: "top", skipTaskbar: true, focusable: false,
      }, signal);
      if (!window.ok) {
        if (signal.aborted || window.error.code === "CANCELLED") request.resolve(cancelled());
        else {
          logger.error(ctx.pluginId, "Cannot display notification", { error: window.error });
          request.resolve(failure("DISPLAY_FAILED", "Cannot display the notification."));
        }
        return;
      }

      if (signal.aborted) request.resolve(cancelled());
      else {
        request.resolve(shown);
        logger.debug(ctx.pluginId, "Notification displayed");
      }
      await waitForDismissal(window.value, signal, Math.min(15000, Math.max(5000, text.length * 25)));
      const closed = await window.value.close();
      if (!closed.ok) logger.error(ctx.pluginId, "Cannot dismiss notification", { error: closed.error });
    } catch (error) {
      if (!signal.aborted) logger.error(ctx.pluginId, "Notification display failed", { error });
      request.resolve(signal.aborted ? cancelled() : failure("DISPLAY_FAILED", "Cannot display the notification."));
    }
  }

  async function drain(): Promise<void> {
    for (let request = waiting.shift(); request; request = waiting.shift()) {
      current = request;
      try { await display(request); }
      finally {
        request.release();
        request.lifetime.abort();
        current = undefined;
      }
    }
  }

  function schedule(): void {
    worker ??= Promise.resolve().then(drain).finally(() => {
      worker = undefined;
      if (waiting.length && !ctx.signal.aborted) schedule();
    });
  }

  ctx.signal.addEventListener("abort", () => {
    for (const request of waiting.splice(0)) {
      request.resolve(cancelled());
      request.release();
      request.lifetime.abort();
    }
    current?.lifetime.abort();
  }, { once: true });
  ctx.scope.own({ async dispose() { await worker; } });

  ctx.provide(Notifications, {
    show(options, owner) {
      const content = readNotificationOptions(options);
      if (!content || !owner || typeof owner.addEventListener !== "function" || typeof owner.removeEventListener !== "function") {
        return Promise.resolve(failure("INVALID_ARGUMENT", "An icon, title, text and owner are required."));
      }
      if (!validWindowOwner(owner) || ctx.signal.aborted) return Promise.resolve(cancelled());
      if (!windows.supported()) return Promise.resolve(failure("UNSUPPORTED", "Desktop notifications are unavailable."));
      if (waiting.length >= maxWaiting) {
        logger.warn(ctx.pluginId, "Notification queue is full");
        return Promise.resolve(failure("BUSY", "The notification queue is full."));
      }
      return new Promise<NotificationResult>(resolve => {
        const lifetime = new AbortController();
        const request: Request = { options: content, lifetime, resolve, release: () => owner.removeEventListener("abort", cancel) };
        function cancel(): void {
          const index = waiting.indexOf(request);
          if (index !== -1) waiting.splice(index, 1);
          request.release();
          request.resolve(cancelled());
          lifetime.abort();
        }
        waiting.push(request);
        owner.addEventListener("abort", cancel, { once: true });
        schedule();
      });
    },
  });
  logger.info(ctx.pluginId, "Desktop notifications ready");
} });
