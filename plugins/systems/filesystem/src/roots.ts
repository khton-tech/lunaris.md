import type { CancellationSignal, PluginContext } from "@lunaris/sdk";
import { failure } from "@lunaris/filesystem";
import type { FsResult, VaultRoot } from "@lunaris/filesystem";

interface RootState {
  pending: Set<Promise<unknown>>;
  closed: boolean;
  closing?: Promise<FsResult<null>>;
  detach?: () => void;
}

/** Provider-local coordination; native resources still belong to the driver session. */
export function createRootLifecycle(
  ctx: PluginContext,
  release: (id: string) => Promise<FsResult<null>>,
  report: (error: unknown) => void,
) {
  const roots = new Map<string, RootState>();
  const state = (id: string): RootState => {
    let root = roots.get(id);
    if (!root) roots.set(id, root = { pending: new Set(), closed: false });
    return root;
  };
  function run<T>(id: string, work: () => Promise<FsResult<T>>): Promise<FsResult<T>> {
    const root = state(id);
    if (root.closed || root.closing) return Promise.resolve(failure("VAULT_CLOSED", "The root is closing or closed."));
    // Register before invoking the driver, including synchronous failure/reentry.
    let resolve!: (value: FsResult<T> | PromiseLike<FsResult<T>>) => void;
    let reject!: (error: unknown) => void;
    const task = new Promise<FsResult<T>>((yes, no) => { resolve = yes; reject = no; });
    root.pending.add(task);
    try { resolve(work()); } catch (error) { reject(error); }
    void task.finally(() => root.pending.delete(task)).catch(() => {});
    return task;
  }
  function close(id: string): Promise<FsResult<null>> {
    const root = state(id);
    if (root.closing) return root.closing;
    if (root.closed) return Promise.resolve(failure("VAULT_CLOSED", "The root is closed."));
    root.closing = Promise.resolve().then(async () => {
      try {
        await Promise.allSettled([...root.pending]);
        if (ctx.signal.aborted) return failure("VAULT_CLOSED", "The filesystem provider is stopped.");
        const result = await release(id);
        if (result.ok || result.error.code === "VAULT_CLOSED") {
          root.closed = true;
          root.detach?.();
          delete root.detach;
        }
        return result;
      } finally { delete root.closing; }
    });
    return root.closing;
  }
  async function acquire<T extends VaultRoot | null>(
    owner: CancellationSignal,
    open: () => Promise<FsResult<T>>,
  ): Promise<FsResult<T>> {
    if (!owner || typeof owner.aborted !== "boolean" || typeof owner.addEventListener !== "function" || typeof owner.removeEventListener !== "function") {
      return failure("INVALID_ARGUMENT", "A cancellation signal is required to own a root.");
    }
    if (owner.aborted) return failure("VAULT_CLOSED", "The root owner is stopped.");
    const result = await open();
    if (!result.ok || result.value === null) return result;
    const root = result.value;
    if (ctx.signal.aborted) return failure("VAULT_CLOSED", "The filesystem provider is stopped.");
    const onAbort = () => {
      if (!ctx.signal.aborted) void close(root.id).then(closed => {
        if (!closed.ok && closed.error.code !== "VAULT_CLOSED") report(closed.error);
      }).catch(report);
    };
    if (owner.aborted) {
      const closed = await close(root.id);
      if (!closed.ok && closed.error.code !== "VAULT_CLOSED") report(closed.error);
      return failure("VAULT_CLOSED", "The root owner stopped during selection.");
    }
    state(root.id).detach = () => owner.removeEventListener("abort", onAbort);
    owner.addEventListener("abort", onAbort, { once: true });
    Object.freeze(root);
    return result;
  }
  ctx.scope.own({ dispose() {
    for (const root of roots.values()) root.detach?.();
    roots.clear();
    // The driver disposes its native session; closed SDK handles are never called.
  } });
  return { run, close, acquire };
}
