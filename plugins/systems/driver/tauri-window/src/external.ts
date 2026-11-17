import type { LoggerApi } from "@lunaris/logging";
import type { PluginContext } from "@lunaris/sdk";
import { validWindowOwner, windowFailure } from "@lunaris/window";
import type { WindowResult } from "@lunaris/window";
import { validWindowPosition, validWindowSize } from "@lunaris/window/external";
import type { ExternalWindowDriverApi, ExternalWindowSurface } from "@lunaris/window/external";
import type { ExternalWindowPort, WindowOperation } from "./native-external.js";

export async function createExternalWindowPort(ctx: PluginContext, logger: LoggerApi, native: ExternalWindowPort | null): Promise<ExternalWindowDriverApi> {
  if (!native) return {
    supported: () => false,
    async open() { return windowFailure("UNSUPPORTED", "External windows require a desktop host."); },
  };
  const entries = new Map<string, { finish(): void; cancel(): Promise<WindowResult> }>();
  const unlisten = await native.listen(id => entries.get(id)?.finish());
  ctx.scope.own({ async dispose() {
    try {
      const results = await Promise.all([...entries.values()].map(entry => entry.cancel()));
      const failed = results.find(result => !result.ok);
      if (failed) throw new Error("Cannot release all native external windows.", { cause: failed.error });
    } finally { unlisten(); }
  } });

  return {
    supported: () => true,
    async open(options, owner) {
      if (!validWindowOwner(owner)) return windowFailure("CANCELLED", "The window owner stopped.");
      const id = `external-${crypto.randomUUID()}`;
      const lifetime = new AbortController();
      let finished = false;
      let resolveClosed!: () => void;
      const closed = new Promise<void>(resolve => { resolveClosed = resolve; });
      let closeTask: Promise<WindowResult> | undefined;
      let queue: Promise<unknown>;
      const success = { ok: true, value: null } as const;
      function finish(): void {
        if (finished) return;
        finished = true;
        entries.delete(id);
        owner.removeEventListener("abort", abort);
        lifetime.abort();
        resolveClosed();
      }
      async function run(operation: WindowOperation): Promise<WindowResult> {
        try {
          await native!.operate(id, operation);
          logger.debug(ctx.pluginId, "Native external window operation completed", { data: { operation: operation.kind } });
          return success;
        } catch (error) {
          logger.error(ctx.pluginId, "Native external window operation failed", { data: { operation: operation.kind }, error });
          return windowFailure("NATIVE_FAILED", "The native external window operation failed.");
        }
      }
      function enqueue(operation: WindowOperation): Promise<WindowResult> {
        if (finished || closeTask || lifetime.signal.aborted) return Promise.resolve(windowFailure("CANCELLED", "The external window is closing."));
        const task = queue.then(() => lifetime.signal.aborted ? windowFailure("CANCELLED", "The external window closed.") : run(operation));
        queue = task;
        return task;
      }
      function close(): Promise<WindowResult> {
        if (finished) return Promise.resolve(success);
        closeTask ??= queue.then(async () => {
          if (finished) return success;
          const result = await run({ kind: "close" });
          if (result.ok) finish();
          return result;
        }).finally(() => { closeTask = undefined; });
        return closeTask;
      }
      function cancel(): Promise<WindowResult> { lifetime.abort(); return close(); }
      function abort(): void { void cancel(); }

      const opening = native.open(id, options, lifetime.signal);
      queue = opening.catch(() => {});
      owner.addEventListener("abort", abort, { once: true });
      entries.set(id, { finish, cancel });
      if (owner.aborted) abort();
      try {
        const target = await opening;
        if (lifetime.signal.aborted) return windowFailure("CANCELLED", "The window owner stopped.");
        return { ok: true, value: Object.freeze<ExternalWindowSurface>({
          target, signal: lifetime.signal, closed, close,
          show: () => enqueue({ kind: "show" }), hide: () => enqueue({ kind: "hide" }),
          move: position => validWindowPosition(position) ? enqueue({ kind: "move", position }) : Promise.resolve(windowFailure("INVALID_ARGUMENT", "Invalid window position.")),
          resize: size => validWindowSize(size) ? enqueue({ kind: "resize", size }) : Promise.resolve(windowFailure("INVALID_ARGUMENT", "Invalid window size.")),
        }) };
      } catch (error) {
        const cancelled = lifetime.signal.aborted;
        await close();
        if (cancelled) return windowFailure("CANCELLED", "The window owner stopped.");
        logger.error(ctx.pluginId, "Cannot create native external window", { error });
        return windowFailure("NATIVE_FAILED", "Cannot create the native external window.");
      }
    },
  };
}
