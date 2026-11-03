import type { CancellationSignal } from "@lunaris/sdk";

export class SignalController {
  #aborted = false;
  #reason: unknown;
  #listeners = new Map<() => void, boolean>();
  readonly signal: CancellationSignal;

  constructor(private readonly invoke: <T>(callback: () => T) => T, private readonly onError: (error: unknown) => void) {
    const owner = this;
    this.signal = Object.freeze({
      get aborted() { return owner.#aborted; },
      get reason() { return owner.#reason; },
      throwIfAborted() { if (owner.#aborted) throw owner.#reason; },
      addEventListener(_type: "abort", listener: () => void, options?: { readonly once?: boolean }) {
        if (!owner.#aborted && !owner.#listeners.has(listener)) owner.#listeners.set(listener, options?.once === true);
      },
      removeEventListener(_type: "abort", listener: () => void) { owner.#listeners.delete(listener); },
    });
  }

  abort(reason: unknown): void {
    if (this.#aborted) return;
    this.#aborted = true;
    this.#reason = reason;
    for (const [listener, once] of [...this.#listeners]) {
      if (!this.#listeners.has(listener)) continue;
      if (once) this.#listeners.delete(listener);
      try { void Promise.resolve(this.invoke(listener)).catch(this.onError); }
      catch (error) { this.onError(error); }
    }
    this.#listeners.clear();
  }
}
