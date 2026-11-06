import type { CancellationSignal, PluginContext } from "@lunaris/sdk";
import { failure } from "@lunaris/filesystem";
import type { FileTarget, FsResult } from "@lunaris/filesystem";

/** Watches belong to consumers; driver session shutdown remains the native safety net. */
export function createObservation(ctx: PluginContext, create: (target: FileTarget, recursive: boolean) => Promise<FsResult<string>>,
  remove: (vaultId: string, watchId: string) => Promise<FsResult<null>>, report: (error: unknown) => void) {
  const entries = new Map<string, { detach(): void }>();
  const retired = new Set<string>();
  const closed = new Set<string>();
  const pending = new Set<() => void>();
  const key = (vaultId: string, watchId: string) => JSON.stringify([vaultId, watchId]);
  const cancelled = () => failure("CANCELLED", "Observation ownership has ended.");
  async function unwatch(vaultId: string, watchId: string): Promise<FsResult<null>> {
    const id = key(vaultId, watchId);
    if (retired.has(id) || closed.has(vaultId)) return { ok: true, value: null };
    retired.add(id); entries.get(id)?.detach(); entries.delete(id);
    if (ctx.signal.aborted) return { ok: true, value: null };
    return remove(vaultId, watchId);
  }
  async function watch(target: FileTarget, owner: CancellationSignal, recursive = true): Promise<FsResult<string>> {
    if (!owner || typeof owner.aborted !== "boolean" || typeof owner.addEventListener !== "function" || typeof owner.removeEventListener !== "function") return failure("INVALID_ARGUMENT", "A cancellation signal is required.");
    if (owner.aborted || ctx.signal.aborted) return cancelled();
    let ended = false; let watchId: string | undefined;
    const detach = () => { owner.removeEventListener("abort", abort); pending.delete(detach); };
    const abort = () => {
      ended = true; detach();
      if (watchId !== undefined && !ctx.signal.aborted) void unwatch(target.vaultId, watchId).then(result => {
        if (!result.ok && !ctx.signal.aborted) report(result.error);
      }).catch(error => { if (!ctx.signal.aborted) report(error); });
    };
    owner.addEventListener("abort", abort, { once: true }); pending.add(detach);
    if (owner.aborted) abort();
    if (ended) return cancelled();
    try {
      const result = await create(target, recursive);
      if (!result.ok) { detach(); return ended ? cancelled() : result; }
      watchId = result.value;
      if (ended || owner.aborted || ctx.signal.aborted || closed.has(target.vaultId)) {
        detach();
        if (!ctx.signal.aborted) {
          const released = await unwatch(target.vaultId, watchId);
          if (!released.ok) report(released.error);
        }
        return cancelled();
      }
      pending.delete(detach); entries.set(key(target.vaultId, watchId), { detach });
      return result;
    } catch (error) { detach(); throw error; }
  }
  function close(vaultId: string): void {
    closed.add(vaultId);
    for (const [id, entry] of entries) {
      if ((JSON.parse(id) as string[])[0] === vaultId) { entry.detach(); entries.delete(id); }
    }
    for (const id of retired) if ((JSON.parse(id) as string[])[0] === vaultId) retired.delete(id);
  }
  ctx.scope.own({ dispose() {
    for (const detach of pending) detach();
    for (const entry of entries.values()) entry.detach();
    entries.clear(); retired.clear(); closed.clear();
  } });
  return { watch, unwatch, close, accepts: (vaultId: string, watchId: string) => !closed.has(vaultId) && !retired.has(key(vaultId, watchId)) };
}
