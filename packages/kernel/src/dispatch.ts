import { LunarisError } from "@lunaris/sdk";
import type { ContractToken, Disposable, EventToken, HookToken, MaybePromise, PluginContext } from "@lunaris/sdk";
import { context } from "./model.js";
import type { Activation, Binding, Registration } from "./model.js";
import type { Access } from "./access.js";
import type { Diagnostics } from "./diagnostics.js";

interface Subscription {
  readonly consumer: Registration;
  readonly activation: Activation;
  readonly binding: Binding;
  readonly token: ContractToken;
  readonly callback: (value: unknown) => MaybePromise<unknown>;
  readonly priority: number;
  readonly order: number;
}

export class DispatchRuntime {
  #subscriptions = new Set<Subscription>();
  #order = 0;
  constructor(private readonly access: Access, private readonly diagnostics: Diagnostics) {}

  #subscribe(record: Registration, activation: Activation, token: ContractToken,
    kind: "event" | "hook", callback: (value: unknown) => MaybePromise<unknown>, priority = 0): Disposable {
    if (token.kind !== kind || typeof callback !== "function" || !Number.isFinite(priority)) {
      throw new LunarisError("VALIDATION_FAILED", "Invalid dispatch registration.", { ...context(record), contractId: token.id });
    }
    const binding = this.access.binding(record, activation, token, "consume")!;
    this.access.authorize(binding.provider, token, "provide");
    const entry: Subscription = { consumer: record, activation, binding, token: Object.freeze({ ...token }), callback, priority, order: ++this.#order };
    this.#subscriptions.add(entry);
    const disposable = Object.freeze({ dispose: () => {
      this.#subscriptions.delete(entry);
      activation.scope.release(disposable);
    } });
    activation.scope.own(disposable);
    return disposable;
  }

  #owner(record: Registration, activation: Activation, token: ContractToken, kind: "event" | "hook"): void {
    if (token.kind !== kind) throw new LunarisError("CONTRACT_METADATA_CONFLICT", "Wrong dispatch primitive.", { contractId: token.id });
    this.access.check(record, activation, token, "provide");
    if (record.state !== "active") throw new LunarisError("CONTRACT_UNAVAILABLE", "Provider endpoint is not committed.", { ...context(record), contractId: token.id });
  }

  async #dispatch(record: Registration, activation: Activation, token: ContractToken, value: unknown, kind: "event" | "hook"): Promise<unknown> {
    this.#owner(record, activation, token, kind);
    token = Object.freeze({ ...token });
    this.access.validate(token, value);
    const snapshot = [...this.#subscriptions].filter(entry => entry.token.kind === kind && entry.token.id === token.id &&
      entry.binding.provider === record && entry.binding.activation === activation);
    if (kind === "hook") snapshot.sort((a, b) => a.priority - b.priority ||
      (a.consumer.definition.manifest.id < b.consumer.definition.manifest.id ? -1 : a.consumer.definition.manifest.id > b.consumer.definition.manifest.id ? 1 : a.order - b.order));
    for (const entry of snapshot) {
      this.#owner(record, activation, token, kind);
      if (!this.#subscriptions.has(entry) || entry.consumer.state !== "active" || entry.consumer.activation !== entry.activation || entry.activation.scope.closed) continue;
      try {
        this.access.check(entry.consumer, entry.activation, entry.token, "consume");
        this.access.available(entry.binding, entry.token);
        this.access.compatible(token, entry.token);
        this.access.validate(entry.token, value);
        this.#owner(record, activation, token, kind);
        this.access.check(entry.consumer, entry.activation, entry.token, "consume");
        if (entry.activation.scope.closed || !this.#subscriptions.has(entry)) continue;
        const output = await this.access.invoke(() => entry.callback(value));
        if (kind === "hook") {
          this.access.validate(entry.token, output);
          this.access.validate(token, output);
          value = output;
        }
      } catch (cause) {
        this.diagnostics.record(kind === "event" ? "EVENT_LISTENER_FAILED" : "HOOK_FAILED", { ...context(entry.consumer, entry.activation), contractId: token.id }, cause);
        if (kind === "hook") throw cause;
      }
    }
    this.#owner(record, activation, token, kind);
    return value;
  }

  events(record: Registration, activation: Activation): PluginContext["events"] {
    return Object.freeze({
      on: <T>(token: EventToken<T>, listener: (payload: Readonly<T>) => MaybePromise<void>) =>
        this.#subscribe(record, activation, token, "event", listener as (value: unknown) => MaybePromise<unknown>),
      emit: async <T>(token: EventToken<T>, payload: Readonly<T>) => { await this.#dispatch(record, activation, token, payload, "event"); },
    });
  }

  hooks(record: Registration, activation: Activation): PluginContext["hooks"] {
    return Object.freeze({
      register: <T>(token: HookToken<T>, handler: (value: T) => MaybePromise<T>, options?: { readonly priority?: number }) =>
        this.#subscribe(record, activation, token, "hook", handler as (value: unknown) => MaybePromise<unknown>, options?.priority ?? 0),
      run: async <T>(token: HookToken<T>, value: T) => await this.#dispatch(record, activation, token, value, "hook") as T,
    });
  }
}
