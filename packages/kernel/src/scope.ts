import { LunarisError } from "@lunaris/sdk";
import type { Disposable, ErrorContext, ResourceScope } from "@lunaris/sdk";
import { SignalController } from "./signal.js";

interface Entry {
  readonly resource: Disposable;
  readonly method: Disposable["dispose"];
  readonly child?: OwnedScope;
  promise?: Promise<void>;
}

/** Internal controller; plugins receive only its frozen SDK facade. */
export class OwnedScope {
  readonly facade: ResourceScope;
  readonly #signal: SignalController;
  #closed = false;
  #entries: Entry[] = [];
  #pending = new Set<Entry>();
  #children = new Set<OwnedScope>();
  #known: WeakMap<object, Entry>;
  #disposal: Promise<void> | undefined;
  #requestedDisposal: Promise<void> | undefined;
  #invoking = false;
  #errors: unknown[] = [];

  constructor(
    private readonly context: ErrorContext,
    private readonly invoke: <T>(callback: () => T) => T,
    private readonly onError: (error: unknown) => void,
    private readonly onClose: () => void = () => {},
    known = new WeakMap<object, Entry>(),
    private readonly onDisposed: () => void = () => {},
    private readonly disposeRoot?: () => Promise<void>,
  ) {
    this.#known = known;
    this.#signal = new SignalController(invoke, onError);
    this.facade = Object.freeze({
      signal: this.#signal.signal,
      own: <T extends Disposable>(resource: T): T => this.own(resource),
      child: (): ResourceScope => this.child(),
      dispose: (): Promise<void> => this.#requestDisposal(),
    });
  }

  get closed(): boolean { return this.#closed; }

  #requestDisposal(): Promise<void> {
    if (this.#hasInvokingDisposer()) return Promise.reject(new LunarisError("LIFECYCLE_REENTRANT", "Recursive scope disposal.", this.context));
    if (!this.disposeRoot) return this.dispose();
    if (!this.#requestedDisposal) {
      // Publish before closing the signal: abort listeners may request disposal again.
      let resolve!: (result: Promise<void>) => void;
      let reject!: (cause: unknown) => void;
      this.#requestedDisposal = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
      try { resolve(this.disposeRoot()); } catch (cause) { reject(cause); }
    }
    return this.#requestedDisposal;
  }
  get resourceCount(): number {
    return this.#entries.length + this.#pending.size + [...this.#children].reduce((count, child) => count + child.resourceCount, 0);
  }

  assertOpen(): void {
    if (this.#closed) throw new LunarisError("SCOPE_CLOSED", "Activation scope is closed.", this.context);
  }

  #entry(resource: Disposable, child?: OwnedScope): Entry {
    if ((typeof resource !== "object" && typeof resource !== "function") || resource === null) {
      throw new LunarisError("VALIDATION_FAILED", "Owned resource must have a dispose method.", this.context);
    }
    const existing = this.#known.get(resource);
    if (existing) return existing;
    const method = resource.dispose;
    if (typeof method !== "function") throw new LunarisError("VALIDATION_FAILED", "Owned resource must have a dispose method.", this.context);
    const entry: Entry = { resource, method, ...(child ? { child } : {}) };
    this.#known.set(resource, entry);
    return entry;
  }

  own<T extends Disposable>(resource: T): T {
    const entry = this.#entry(resource);
    if (this.#closed) {
      void this.#run(entry).catch(() => {});
      throw new LunarisError("SCOPE_CLOSED", "Cannot own resources in a closed scope.", this.context);
    }
    if (!this.#entries.includes(entry)) this.#entries.push(entry);
    return resource;
  }

  /** Internal registrations can release an already-disposed ownership slot. */
  release(resource: Disposable): void {
    const entry = this.#known.get(resource);
    if (!entry) return;
    const index = this.#entries.indexOf(entry);
    if (index !== -1) this.#entries.splice(index, 1);
  }

  /** A returned teardown must be first even if it was already owned earlier. */
  teardown(resource: Disposable): void {
    const entry = this.#entry(resource);
    if (this.#closed) { void this.#run(entry).catch(() => {}); return; }
    const index = this.#entries.indexOf(entry);
    if (index !== -1) this.#entries.splice(index, 1);
    this.#entries.push(entry);
  }

  child(): ResourceScope {
    this.assertOpen();
    let entry: Entry;
    const child = new OwnedScope(this.context, this.invoke, this.onError, () => {}, this.#known, () => {
      this.#children.delete(child);
      const index = this.#entries.indexOf(entry);
      if (index !== -1) this.#entries.splice(index, 1);
    });
    entry = this.#entry(child.facade, child);
    this.#children.add(child);
    this.#entries.push(entry);
    return child.facade;
  }

  close(reason: unknown = new LunarisError("SCOPE_CLOSED", "Activation scope is closed.", this.context)): void {
    if (this.#closed) return;
    this.#closed = true;
    this.onClose();
    this.#signal.abort(reason);
    for (const child of this.#children) child.close(reason);
  }

  #run(entry: Entry): Promise<void> {
    if (entry.promise) return entry.promise;
    this.#pending.add(entry);
    // Assign before callbacks execute so duplicate ownership is disposed once.
    entry.promise = Promise.resolve().then(() => {
      this.#invoking = true;
      try { return this.invoke(() => entry.method.call(entry.resource)); }
      finally { this.#invoking = false; }
    }).then(() => {}, error => {
      this.#errors.push(error);
      this.onError(error);
      throw error;
    }).finally(() => { this.#pending.delete(entry); });
    return entry.promise;
  }

  dispose(): Promise<void> {
    if (this.#hasInvokingDisposer()) return Promise.reject(new LunarisError("LIFECYCLE_REENTRANT", "Recursive scope disposal.", this.context));
    if (this.#disposal) return this.#disposal;
    // Install the promise before abort listeners or disposers can recurse.
    this.#disposal = Promise.resolve().then(async () => {
      try {
        while (this.#entries.length) {
          const entry = this.#entries.pop()!;
          try { await this.#run(entry); } catch { /* Continue and aggregate below. */ }
        }
        if (this.#errors.length) throw new AggregateError([...this.#errors], "Scope cleanup failed.");
      } finally { this.onDisposed(); }
    });
    this.close();
    return this.#disposal;
  }

  #hasInvokingDisposer(): boolean {
    return this.#invoking || [...this.#children].some(child => child.#hasInvokingDisposer());
  }

  /** Deadline fallback: attempt every remaining resource without unbounded waits. */
  drain(): void {
    this.close();
    while (this.#entries.length) {
      const entry = this.#entries.pop()!;
      void this.#run(entry).catch(() => {});
      entry.child?.drain();
    }
    for (const entry of this.#pending) entry.child?.drain();
  }
}
