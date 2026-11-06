import type { CancellationSignal, PluginContext } from "@lunaris/sdk";
import { failure } from "@lunaris/filesystem";
import type { FileTarget, FsResult } from "@lunaris/filesystem";

/** Native watches are independently owned even when only the SDK provider stops. */
export function createNativeObservation(ctx: PluginContext,
  create: (target: FileTarget, recursive: boolean) => Promise<FsResult<string>>,
  remove: (vaultId: string, watchId: string) => Promise<FsResult<null>>,
  suppress: (watchId: string) => void, report: (error: unknown) => void) {
  const entries = new Map<string, { vaultId: string; detach(): void }>();
  const pending = new Set<() => void>();
  function forget(watchId: string): void { entries.get(watchId)?.detach(); entries.delete(watchId); }
  async function watch(target: FileTarget, owner: CancellationSignal, recursive = true): Promise<FsResult<string>> {
    if (!owner || typeof owner.aborted !== "boolean" || typeof owner.addEventListener !== "function" || typeof owner.removeEventListener !== "function") return failure("INVALID_ARGUMENT", "A cancellation signal is required.");
    if (owner.aborted || ctx.signal.aborted) return failure("CANCELLED", "Observation ownership has ended.");
    let ended = false; let watchId: string | undefined;
    const detach = () => { owner.removeEventListener("abort", abort); pending.delete(detach); };
    async function release(id: string): Promise<void> {
      suppress(id); forget(id);
      if (ctx.signal.aborted) return;
      try { const result = await remove(target.vaultId, id); if (!result.ok && result.error.code !== "VAULT_CLOSED" && !ctx.signal.aborted) report(result.error); }
      catch (error) { if (!ctx.signal.aborted) report(error); }
    }
    const abort = () => { ended = true; detach(); if (watchId !== undefined) void release(watchId); };
    owner.addEventListener("abort", abort, { once: true }); pending.add(detach);
    if (owner.aborted) abort();
    try {
      if (ended) return failure("CANCELLED", "Observation ownership has ended.");
      const result = await create(target, recursive);
      if (!result.ok) { detach(); return result; }
      watchId = result.value;
      if (ended || owner.aborted || ctx.signal.aborted) {
        detach(); await release(watchId); return failure("CANCELLED", "Observation ownership has ended.");
      }
      pending.delete(detach); entries.set(watchId, { vaultId: target.vaultId, detach }); return result;
    } catch (error) { detach(); throw error; }
  }
  ctx.scope.own({ dispose() { for (const detach of pending) detach(); for (const entry of entries.values()) entry.detach(); entries.clear(); } });
  return { watch, forget, close(vaultId: string) { for (const [id, entry] of entries) if (entry.vaultId === vaultId) forget(id); } };
}
