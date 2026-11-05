import type { CancellationSignal, PluginContext } from "@lunaris/sdk";
import { failure } from "@lunaris/filesystem";
import type { FsResult, VaultRoot } from "@lunaris/filesystem";

interface Root {
  pending: Set<Promise<unknown>>;
  closed: boolean;
  closing?: Promise<FsResult<null>>;
  detach?: () => void;
}

/** Own native roots independently of SDK handles, including whole-application shutdown. */
export function createNativeRoots(ctx: PluginContext, release: (id: string) => Promise<FsResult<null>>) {
  const roots = new Map<string, Root>();
  const releasing = new Set<Promise<void>>();
  const errors: unknown[] = [];
  const state = (id: string): Root => {
    let root = roots.get(id);
    if (!root) roots.set(id, root = { pending: new Set(), closed: false });
    return root;
  };
  function run<T>(id: string | undefined, work: () => Promise<FsResult<T>>): Promise<FsResult<T>> {
    if (id === undefined) return work();
    const root = state(id);
    if (root.closed || root.closing) return Promise.resolve(failure("VAULT_CLOSED", "The root is closing or closed."));
    const task = work();
    root.pending.add(task);
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
        const result = await release(id);
        if (result.ok || result.error.code === "VAULT_CLOSED") {
          root.closed = true;
          root.detach?.(); delete root.detach;
        }
        return result;
      } finally { delete root.closing; }
    });
    return root.closing;
  }
  function retire(id: string): void {
    const task = close(id).then(result => {
      if (!result.ok && result.error.code !== "VAULT_CLOSED") errors.push(result.error);
    }).catch(error => { errors.push(error); });
    releasing.add(task);
    void task.then(() => releasing.delete(task));
  }
  async function acquire<T extends VaultRoot | null>(owner: CancellationSignal, open: () => Promise<FsResult<T>>): Promise<FsResult<T>> {
    if (!owner || typeof owner.aborted !== "boolean" || typeof owner.addEventListener !== "function" || typeof owner.removeEventListener !== "function") {
      return failure("INVALID_ARGUMENT", "A cancellation signal is required to own a root.");
    }
    if (owner.aborted || ctx.signal.aborted) return failure("VAULT_CLOSED", "The root owner is stopped.");
    const result = await open();
    if (!result.ok || result.value === null) return result;
    const root = Object.freeze(result.value);
    if (owner.aborted || ctx.signal.aborted) {
      const closed = await close(root.id);
      if (!closed.ok && closed.error.code !== "VAULT_CLOSED") errors.push(closed.error);
      return failure("VAULT_CLOSED", "The root owner stopped during selection.");
    }
    const abort = () => retire(root.id);
    state(root.id).detach = () => owner.removeEventListener("abort", abort);
    owner.addEventListener("abort", abort, { once: true });
    return result;
  }
  ctx.scope.own({ async dispose() {
    for (const root of roots.values()) root.detach?.();
    await Promise.allSettled([...releasing]);
    roots.clear();
    // Native end runs next and releases any remaining roots. Cleanup errors use
    // independent kernel diagnostics, never a Logger handle during shutdown.
    if (errors.length) throw new AggregateError(errors, "Owned native root cleanup failed.");
  } });
  return { acquire, run, close };
}
