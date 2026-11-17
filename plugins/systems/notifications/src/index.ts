import { Logger, scopeLogger } from "@lunaris/logging";
import { NotificationRole, Notifications, readNotificationOptions } from "@lunaris/notifications";
import type { NotificationErrorCode, NotificationOptions, NotificationResult } from "@lunaris/notifications";
import { definePlugin } from "@lunaris/sdk";
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

interface VisibleNotification {
  readonly request: Request;
  readonly window: ExternalWindow;
  slot: number;
  timer?: ReturnType<typeof setTimeout>;
  closing?: Promise<void>;
}

const maxWaiting = 32;
const maxVisible = 4;
const size = { width: 384, height: 64 } as const;
const gap = 8;
const shown = { ok: true, value: null } as const;
const failure = (code: NotificationErrorCode, message: string): NotificationResult => ({ ok: false, error: { code, message } });
const cancelled = () => failure("CANCELLED", "The notification owner stopped.");

function positionForSlot(slot: number) {
  return { anchor: "bottom-right", offset: { x: 0, y: 0 - (size.height + gap) * slot } } as const;
}

export default definePlugin({ manifest, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal);
  const windows = ctx.use(ExternalWindows);
  const waiting: Request[] = [];
  const visible = new Map<Request, VisibleNotification>();
  let opening: Request | undefined;
  let worker: Promise<void> | undefined;
  let needsLayout = false;

  function remove(entry: VisibleNotification): void {
    if (!visible.delete(entry.request)) return;
    clearTimeout(entry.timer);
    entry.request.release();
    entry.request.lifetime.abort();
    needsLayout = true;
    schedule();
  }

  function dismiss(entry: VisibleNotification): Promise<void> {
    if (entry.closing) return entry.closing;
    clearTimeout(entry.timer);
    const close = async () => {
      let error: unknown;
      try {
        const result = await entry.window.close();
        if (result.ok) return;
        error = result.error;
      } catch (cause) { error = cause; }
      // Cancellation also asks the driver to release the native lease.
      logger.warn(ctx.pluginId, "Retrying notification dismissal", { error });
      entry.request.lifetime.abort();
      const retry = await entry.window.close();
      if (!retry.ok) throw new Error("Cannot dismiss notification.", { cause: retry.error });
    };
    entry.closing = close().finally(() => { delete entry.closing; });
    return entry.closing;
  }

  function reportDismissal(entry: VisibleNotification): void {
    void dismiss(entry).catch(error => logger.error(ctx.pluginId, "Cannot dismiss notification", { error }));
  }

  async function compact(): Promise<void> {
    let next = 0;
    for (const entry of [...visible.values()].sort((left, right) => left.slot - right.slot)) {
      if (!visible.has(entry.request)) continue;
      // Moving from the bottom up leaves each destination free before reuse.
      if (entry.slot > next && !entry.closing) {
        try {
          const moved = await entry.window.move(positionForSlot(next));
          if (moved.ok) entry.slot = next;
          else if (!entry.request.lifetime.signal.aborted && moved.error.code !== "CANCELLED") {
            logger.warn(ctx.pluginId, "Cannot reposition notification", { error: moved.error });
          }
        } catch (error) {
          if (!entry.request.lifetime.signal.aborted) logger.warn(ctx.pluginId, "Cannot reposition notification", { error });
        }
      }
      if (visible.has(entry.request)) next = entry.slot + 1;
    }
  }

  async function display(request: Request, slot: number): Promise<void> {
    const { icon, title, text } = request.options;
    const signal = request.lifetime.signal;
    if (signal.aborted) { request.resolve(cancelled()); return; }
    try {
      const window = await windows.open({
        title, componentId: NotificationRole,
        props: { icon, title, text, presentation: { mode: "standalone", sizing: "fill" } },
        size, position: positionForSlot(slot), layer: "top", skipTaskbar: true, focusable: false,
      }, signal);
      if (!window.ok) {
        if (signal.aborted || window.error.code === "CANCELLED") request.resolve(cancelled());
        else {
          logger.error(ctx.pluginId, "Cannot display notification", { error: window.error });
          request.resolve(failure("DISPLAY_FAILED", "Cannot display the notification."));
        }
        return;
      }

      const displayed: VisibleNotification = { request, window: window.value, slot };
      visible.set(request, displayed);
      void displayed.window.closed.then(() => remove(displayed));
      if (signal.aborted) {
        request.resolve(cancelled());
        reportDismissal(displayed);
        return;
      }
      displayed.timer = setTimeout(() => reportDismissal(displayed), Math.min(15000, Math.max(5000, text.length * 25)));
      request.resolve(shown);
      logger.debug(ctx.pluginId, "Notification displayed", { data: { visible: visible.size } });
    } catch (error) {
      if (!signal.aborted) logger.error(ctx.pluginId, "Notification display failed", { error });
      request.resolve(signal.aborted ? cancelled() : failure("DISPLAY_FAILED", "Cannot display the notification."));
    }
  }

  async function drain(): Promise<void> {
    while (!ctx.signal.aborted) {
      if (needsLayout) { needsLayout = false; await compact(); }
      if (needsLayout) continue;
      if (visible.size >= maxVisible) return;
      const request = waiting.shift();
      if (!request) return;
      const occupied = new Set([...visible.values()].map(entry => entry.slot));
      let slot = 0;
      while (occupied.has(slot)) slot++;
      opening = request;
      try { await display(request, slot); }
      finally {
        if (!visible.has(request)) {
          request.release();
          request.lifetime.abort();
        }
        opening = undefined;
      }
    }
  }

  function schedule(): void {
    if (ctx.signal.aborted || (!needsLayout && (!waiting.length || visible.size >= maxVisible))) return;
    worker ??= Promise.resolve().then(drain).finally(() => {
      worker = undefined;
      schedule();
    });
  }

  ctx.signal.addEventListener("abort", () => {
    for (const request of waiting.splice(0)) {
      request.resolve(cancelled());
      request.release();
      request.lifetime.abort();
    }
    if (opening) {
      opening.resolve(cancelled());
      opening.lifetime.abort();
    }
    for (const entry of visible.values()) {
      clearTimeout(entry.timer);
      entry.request.lifetime.abort();
    }
  }, { once: true });
  ctx.scope.own({ async dispose() {
    await worker;
    await Promise.all([...visible.values()].map(dismiss));
  } });

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
          const entry = visible.get(request);
          if (entry) reportDismissal(entry);
        }
        waiting.push(request);
        owner.addEventListener("abort", cancel, { once: true });
        schedule();
      });
    },
  });
  logger.info(ctx.pluginId, "Desktop notifications ready");
} });
