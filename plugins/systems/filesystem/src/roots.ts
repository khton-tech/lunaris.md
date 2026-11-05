import type { PluginContext } from "@lunaris/sdk";
import { failure } from "@lunaris/filesystem";
import type { FsResult } from "@lunaris/filesystem";

interface RootState {
  pending: Set<Promise<unknown>>;
  closed: boolean;
  closing?: Promise<FsResult<null>>;
}

/** Provider-local coordination; native resources still belong to the driver session. */
export function createRootLifecycle(
  ctx: PluginContext,
  release: (id: string) => Promise<FsResult<null>>,
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
        }
        return result;
      } finally { delete root.closing; }
    });
    return root.closing;
  }
  ctx.scope.own({ dispose() {
    roots.clear();
    // The driver disposes its native session; closed SDK handles are never called.
  } });
  return { run, close };
}
