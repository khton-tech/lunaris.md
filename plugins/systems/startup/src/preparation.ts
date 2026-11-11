import type { CancellationSignal } from "@lunaris/sdk";
import type { PreparationContext, PreparationParticipant, PreparationSnapshot } from "@lunaris/startup";

const phases = ["settings", "document", "content", "presentation"] as const;

/** Ordered, cancellable preparation; application/Vault policy belongs to callers. */
export function createPreparation(publish: (snapshot: PreparationSnapshot) => Promise<void>, timeoutMs: number, tracksVault = false, currentVault?: () => string | null) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError("A positive preparation deadline is required.");
  const entries = new Map<string, { participant: PreparationParticipant; owner: CancellationSignal; remove(): void }>();
  let snapshot: PreparationSnapshot = Object.freeze({ epoch: 0, vaultId: null, state: "idle" });
  let attempt: AbortController | undefined;
  const additions = new Set<AbortController>();
  let closed = false;
  async function deliver(value: PreparationSnapshot, signal: CancellationSignal): Promise<void> {
    signal.throwIfAborted();
    let cleanup = () => {};
    await new Promise<void>((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      cleanup = () => signal.removeEventListener("abort", abort);
      Promise.resolve().then(() => publish(value)).then(resolve, reject);
    }).finally(() => cleanup());
  }
  async function invoke(entry: { participant: PreparationParticipant; owner: CancellationSignal }, context: PreparationContext): Promise<void> {
    if (entry.owner.aborted) return;
    context.signal.throwIfAborted();
    const controller = new AbortController();
    let cleanup = () => {};
    await new Promise<void>((resolve, reject) => {
      const abort = () => { controller.abort(context.signal.reason); reject(context.signal.reason); };
      const removed = () => { controller.abort(entry.owner.reason); resolve(); };
      cleanup = () => { context.signal.removeEventListener("abort", abort); entry.owner.removeEventListener("abort", removed); };
      context.signal.addEventListener("abort", abort, { once: true });
      entry.owner.addEventListener("abort", removed, { once: true });
      Promise.resolve().then(() => {
        context.signal.throwIfAborted();
        if (!entry.owner.aborted) return entry.participant.prepare(Object.freeze({ ...context, signal: controller.signal }));
      }).then(resolve, error => reject(new Error(`Preparation failed: ${entry.participant.id}`, { cause: error })))
        .catch(() => {});
    }).finally(() => cleanup());
  }
  async function run(vaultId: string | null, external?: CancellationSignal): Promise<void> {
    if (closed) throw new Error("Preparation provider stopped.");
    external?.throwIfAborted();
    attempt?.abort(new Error("Preparation superseded."));
    for (const addition of additions) addition.abort(new Error("Preparation superseded."));
    const controller = attempt = new AbortController();
    const epoch = snapshot.epoch + 1;
    const abort = () => controller.abort(external?.reason);
    external?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error("Preparation deadline exceeded.")), timeoutMs);
    const context = Object.freeze({ epoch, vaultId, signal: controller.signal });
    const current = () => attempt === controller && !closed;
    try {
      snapshot = Object.freeze({ epoch, vaultId, state: "preparing" }); await deliver(snapshot, controller.signal);
      // Registration is sealed while this ordered attempt is running.
      for (const phase of phases) for (const entry of [...entries.values()].filter(entry => entry.participant.phase === phase)) {
        controller.signal.throwIfAborted();
        if (entries.get(entry.participant.id) === entry) await invoke(entry, context);
      }
      controller.signal.throwIfAborted();
      if (current()) { snapshot = Object.freeze({ epoch, vaultId, state: "ready" }); await deliver(snapshot, controller.signal); }
    } catch (error) {
      if (current()) { snapshot = Object.freeze({ epoch, vaultId, state: "failed" }); void publish(snapshot).catch(() => {}); }
      throw error;
    } finally { clearTimeout(timer); external?.removeEventListener("abort", abort); }
  }
  return {
    run,
    api: {
      snapshot: () => snapshot,
      tracksVault: () => tracksVault,
      async register(participant: PreparationParticipant, owner: CancellationSignal): Promise<void> {
        if (closed || owner.aborted) throw new Error("Preparation owner stopped.");
        if (snapshot.state === "preparing") throw new Error("Register preparation participants before the preparation boundary.");
        if (!participant || typeof participant.id !== "string" || !participant.id || !phases.includes(participant.phase) || typeof participant.prepare !== "function" || entries.has(participant.id)) throw new TypeError("Invalid or duplicate preparation participant.");
        const captured = Object.freeze({ id: participant.id, phase: participant.phase, prepare: participant.prepare.bind(participant) });
        const entry = { participant: captured, owner, remove() { entries.delete(captured.id); owner.removeEventListener("abort", entry.remove); } };
        entries.set(captured.id, entry); owner.addEventListener("abort", entry.remove, { once: true });
        // Runtime additions prepare before their activation completes, without reopening global startup.
        if (snapshot.state === "ready" && (!currentVault || currentVault() === snapshot.vaultId)) {
          const controller = new AbortController();
          additions.add(controller);
          const timer = setTimeout(() => controller.abort(new Error("Preparation deadline exceeded.")), timeoutMs);
          try { await invoke(entry, Object.freeze({ epoch: snapshot.epoch, vaultId: snapshot.vaultId, signal: controller.signal })); }
          catch (error) { entry.remove(); throw error; }
          finally { clearTimeout(timer); additions.delete(controller); }
        }
      },
    },
    dispose() { closed = true; attempt?.abort(new Error("Preparation provider stopped.")); for (const addition of additions) addition.abort(new Error("Preparation provider stopped.")); for (const entry of entries.values()) entry.remove(); },
  };
}
