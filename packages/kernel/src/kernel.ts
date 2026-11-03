import { validateManifest } from "@lunaris/manifest";
import { assertCompatibleTokens, assertDeclaration, contractKey, definePlugin, LunarisError } from "@lunaris/sdk";
import type { ApiToken, ContractToken, Disposable, ErrorCode, PluginContext, PluginDefinition } from "@lunaris/sdk";
import { Diagnostics } from "./diagnostics.js";
import { OwnedScope } from "./scope.js";
import type { Kernel, KernelOptions, KernelSnapshot, PluginState, Scheduler } from "./types.js";

interface Activation {
  readonly id: string;
  readonly scope: OwnedScope;
  readonly apis: Map<string, { readonly token: ContractToken; readonly implementation: object }>;
}
interface Registration {
  readonly definition: PluginDefinition;
  state: PluginState;
  tail: Promise<void>;
  activation?: Activation;
}

class Runtime {
  #plugins = new Map<string, Registration>();
  #nextActivation = 0;
  #callbackDepth = 0;
  readonly #diagnostics: Diagnostics;
  readonly #scheduler: Scheduler;
  readonly #activationTimeout: number;
  readonly #stopTimeout: number;

  constructor(options: KernelOptions) {
    if (!options || typeof options.scheduler?.schedule !== "function") {
      throw new LunarisError("LIFECYCLE_INVALID", "A host scheduler is required.");
    }
    this.#scheduler = options.scheduler;
    this.#activationTimeout = options.activationTimeoutMs ?? 5000;
    this.#stopTimeout = options.stopTimeoutMs ?? 5000;
    const capacity = options.diagnosticCapacity ?? 100;
    if (![this.#activationTimeout, this.#stopTimeout].every(value => Number.isFinite(value) && value > 0) ||
      !Number.isSafeInteger(capacity) || capacity <= 0) {
      throw new LunarisError("LIFECYCLE_INVALID", "Deadlines must be positive finite durations and diagnostic capacity a positive integer.");
    }
    this.#diagnostics = new Diagnostics(capacity);
  }

  #context(record: Registration) {
    return { pluginId: record.definition.manifest.id, state: record.state,
      ...(record.activation ? { activationId: record.activation.id } : {}) };
  }

  #invoke = <T>(callback: () => T): T => {
    this.#callbackDepth++;
    try { return callback(); } finally { this.#callbackDepth--; }
  };

  #guard(): void {
    if (this.#callbackDepth) throw new LunarisError("LIFECYCLE_REENTRANT", "Management cannot reenter a plugin callback.");
  }

  register = (definition: PluginDefinition): void => {
    this.#guard();
    const checked = definePlugin(definition);
    const id = checked.manifest.id;
    const compatibility = validateManifest(checked.manifest, { engineVersion: "0.1.0", sdkVersion: "0.1.0" });
    if (!compatibility.ok) {
      this.#diagnostics.record("VERSION_INCOMPATIBLE", { pluginId: id }, compatibility.diagnostics);
      throw new LunarisError("VERSION_INCOMPATIBLE", "Plugin engine/SDK versions are incompatible.", { pluginId: id }, { cause: compatibility.diagnostics });
    }
    if (this.#plugins.has(id)) {
      this.#diagnostics.record("PLUGIN_DUPLICATE", { pluginId: id });
      throw new LunarisError("PLUGIN_DUPLICATE", "Plugin ID is already registered.", { pluginId: id });
    }
    this.#plugins.set(id, { definition: checked, state: "registered", tail: Promise.resolve() });
  };

  #enqueue(id: string, operation: (record: Registration) => Promise<void>): Promise<void> {
    try {
      this.#guard();
      const record = this.#plugins.get(id);
      if (!record) throw new LunarisError("PLUGIN_NOT_FOUND", "Plugin is not registered.", { pluginId: id });
      const result = record.tail.then(() => operation(record));
      record.tail = result.catch(() => {});
      return result;
    } catch (error) {
      const code = error instanceof LunarisError ? error.code : "LIFECYCLE_INVALID";
      this.#diagnostics.record(code, { pluginId: id }, error);
      return Promise.reject(error);
    }
  }

  #deadline<T>(work: Promise<T>, duration: number, error: LunarisError, expire: () => void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      let cancel: () => void;
      try {
        cancel = this.#scheduler.schedule(duration, () => {
          if (settled) return;
          settled = true;
          expire();
          reject(error);
        });
      } catch (cause) { void work.catch(() => {}); reject(cause); return; }
      work.then(value => {
        if (!settled) { settled = true; cancel(); resolve(value); }
      }, cause => {
        if (!settled) { settled = true; cancel(); reject(cause); }
      });
    });
  }

  #compatible(token: ContractToken, current: Registration): void {
    const key = contractKey(token);
    for (const record of this.#plugins.values()) {
      if (record !== current && record.state !== "active") continue;
      const existing = record.activation?.apis.get(key);
      if (existing) assertCompatibleTokens(existing.token, token);
    }
  }

  #provide<T extends object>(record: Registration, activation: Activation, token: ApiToken<T>, implementation: T): Disposable {
    activation.scope.assertOpen();
    assertDeclaration(record.definition.manifest, token, "provide");
    if (token.kind !== "api") throw new LunarisError("CONTRACT_METADATA_CONFLICT", "Expected an API token.", this.#context(record));
    if (token.providePermission) throw new LunarisError("PERMISSION_DENIED", "Sensitive providers require the P6 permission gateway.", this.#context(record));
    if (implementation === null || typeof implementation !== "object" ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(implementation))) {
      throw new LunarisError("VALIDATION_FAILED", "API implementation must be a plain object of methods.", this.#context(record));
    }
    for (const key of Reflect.ownKeys(implementation)) {
      const descriptor = Object.getOwnPropertyDescriptor(implementation, key);
      if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "function") {
        throw new LunarisError("VALIDATION_FAILED", "API implementation contains a non-method field.", this.#context(record));
      }
    }
    if (token.validate && this.#invoke(() => token.validate!(implementation)) !== true) {
      throw new LunarisError("VALIDATION_FAILED", "API implementation failed contract validation.", this.#context(record));
    }
    activation.scope.assertOpen();
    const key = contractKey(token);
    this.#compatible(token, record);
    if (activation.apis.has(key)) throw new LunarisError("CONTRACT_METADATA_CONFLICT", "API is already provided in this activation.", this.#context(record));
    const entry = { token: Object.freeze({ ...token }), implementation };
    activation.apis.set(key, entry);
    let disposed = false;
    const registration = Object.freeze({ dispose: () => {
      if (disposed) return;
      disposed = true;
      if (activation.apis.get(key) === entry) activation.apis.delete(key);
    } });
    activation.scope.own(registration);
    return registration;
  }

  #pluginContext(record: Registration, activation: Activation): PluginContext {
    const check = (token: ContractToken, role: "provide" | "require" | "optional" | "consume") => {
      activation.scope.assertOpen();
      assertDeclaration(record.definition.manifest, token, role);
    };
    const unsupported = (token: ContractToken, role: "provide" | "consume"): never => {
      check(token, role);
      throw new LunarisError("CONTRACT_UNAVAILABLE", "Event/hook dispatch arrives in P5.", { ...this.#context(record), contractId: token.id });
    };
    const permission = (name: string, optionalOnly: boolean): false => {
      activation.scope.assertOpen();
      const manifest = record.definition.manifest;
      if (!manifest.optionalPermissions.includes(name) && (optionalOnly || !manifest.permissions.includes(name))) {
        throw new LunarisError("PERMISSION_DENIED", "Permission is not declared for this operation.", this.#context(record));
      }
      return false;
    };
    return Object.freeze({
      pluginId: record.definition.manifest.id, activationId: activation.id,
      signal: activation.scope.facade.signal, scope: activation.scope.facade,
      provide: <T extends object>(token: ApiToken<T>, implementation: T) => this.#provide(record, activation, token, implementation),
      use: <T extends object>(token: ApiToken<T>): T => {
        check(token, "require");
        throw new LunarisError("PROVIDER_MISSING", "Capability resolution arrives in P4.", { ...this.#context(record), contractId: token.id });
      },
      optional: <T extends object>(token: ApiToken<T>): T | undefined => { check(token, "optional"); return undefined; },
      events: Object.freeze({
        on: (token: ContractToken) => unsupported(token, "consume"),
        emit: async (token: ContractToken) => unsupported(token, "provide"),
      }),
      hooks: Object.freeze({
        register: (token: ContractToken) => unsupported(token, "consume"),
        run: async (token: ContractToken) => unsupported(token, "provide"),
      }),
      permissions: Object.freeze({
        has: (name: string) => permission(name, false),
        request: async (name: string) => permission(name, true),
      }),
    });
  }

  async #cleanup(record: Registration, activation: Activation): Promise<void> {
    const timeout = new LunarisError("STOP_TIMEOUT", "Cleanup deadline expired; JavaScript may still be running.", this.#context(record));
    try {
      await this.#deadline(activation.scope.dispose(), this.#stopTimeout, timeout, () => activation.scope.drain());
    } catch (cause) {
      activation.scope.drain();
      if (cause === timeout) { this.#diagnostics.record("STOP_TIMEOUT", this.#context(record), cause); throw timeout; }
      throw new LunarisError("CLEANUP_FAILED", "Plugin cleanup failed.", this.#context(record), { cause });
    }
  }

  async #start(record: Registration): Promise<void> {
    if (record.state === "active") return;
    if (!["registered", "stopped", "failed"].includes(record.state)) throw new LunarisError("LIFECYCLE_INVALID", "Cannot start in this state.", this.#context(record));
    record.state = "resolving";
    const id = `${record.definition.manifest.id}:${++this.#nextActivation}`;
    const apis: Activation["apis"] = new Map();
    const scope = new OwnedScope({ pluginId: record.definition.manifest.id, activationId: id }, this.#invoke,
      cause => this.#diagnostics.record("CLEANUP_FAILED", { pluginId: record.definition.manifest.id, activationId: id, state: record.state }, cause),
      () => apis.clear());
    const activation = { id, scope, apis };
    record.activation = activation;
    const timeout = new LunarisError("ACTIVATION_TIMEOUT", "Activation deadline expired; JavaScript may still be running.", this.#context(record));
    let resolutionFailure: LunarisError | undefined;
    let requiredContractId: string | undefined;
    let detached = false;
    try {
      const required = record.definition.manifest.requires.find(requirement => !requirement.optional);
      if (required) {
        requiredContractId = required.id;
        resolutionFailure = new LunarisError("PROVIDER_MISSING", "Capability resolution arrives in P4.", { ...this.#context(record), contractId: required.id });
        throw resolutionFailure;
      }
      record.state = "starting";
      const context = this.#pluginContext(record, activation);
      const work = Promise.resolve().then(() => this.#invoke(() => record.definition.activate(context))).then(teardown => {
        if (teardown !== undefined) scope.teardown(teardown);
      }).catch(cause => {
        if (detached) this.#diagnostics.record("ACTIVATION_FAILED", { pluginId: record.definition.manifest.id, activationId: id, state: "failed" }, cause);
        throw cause;
      });
      await this.#deadline(work, this.#activationTimeout, timeout, () => scope.close(timeout));
      scope.assertOpen();
      for (const entry of apis.values()) this.#compatible(entry.token, record);
      record.state = "active";
    } catch (cause) {
      detached = true;
      record.state = "failed";
      scope.close(cause);
      const code: ErrorCode = cause === timeout ? "ACTIVATION_TIMEOUT" :
        resolutionFailure !== undefined && cause === resolutionFailure ? "PROVIDER_MISSING" : "ACTIVATION_FAILED";
      this.#diagnostics.record(code, { ...this.#context(record),
        ...(requiredContractId ? { contractId: requiredContractId } : {}) }, cause);
      let combined: unknown = cause;
      try { await this.#cleanup(record, activation); }
      catch (cleanup) { combined = new AggregateError([cause, cleanup], "Activation and rollback failed."); }
      throw new LunarisError(code, "Plugin activation failed.", this.#context(record), { cause: combined });
    }
  }

  async #stop(record: Registration): Promise<void> {
    if (record.state === "registered" || record.state === "stopped") return;
    const activation = record.activation;
    if (!activation) return;
    record.state = "stopping";
    activation.scope.close();
    try { await this.#cleanup(record, activation); record.state = "stopped"; }
    catch (cause) { record.state = "failed"; throw cause; }
  }

  start = (id: string): Promise<void> => this.#enqueue(id, record => this.#start(record));
  stop = (id: string): Promise<void> => this.#enqueue(id, record => this.#stop(record));
  restart = (id: string): Promise<void> => this.#enqueue(id, async record => { await this.#stop(record); await this.#start(record); });

  stopAll = async (): Promise<void> => {
    this.#guard();
    const errors: unknown[] = [];
    for (const id of [...this.#plugins.keys()].sort().reverse()) {
      try { await this.stop(id); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new LunarisError("CLEANUP_FAILED", "One or more plugins failed to stop.", {}, { cause: new AggregateError(errors) });
  };

  inspect = (): KernelSnapshot => Object.freeze({
    plugins: Object.freeze([...this.#plugins.values()].sort((a, b) => a.definition.manifest.id < b.definition.manifest.id ? -1 : 1).map(record => Object.freeze({
      manifest: record.definition.manifest, state: record.state,
      ...(record.activation ? { activationId: record.activation.id } : {}),
      contracts: Object.freeze(record.state === "active" && !record.activation?.scope.closed ? [...record.activation!.apis.keys()].sort() : []),
      ownedResources: record.activation?.scope.resourceCount ?? 0,
    }))),
    diagnostics: this.#diagnostics.snapshot(),
  });
}

export function createKernel(options: KernelOptions): Kernel {
  const runtime = new Runtime(options);
  return Object.freeze({ register: runtime.register, start: runtime.start, stop: runtime.stop,
    restart: runtime.restart, stopAll: runtime.stopAll, inspect: runtime.inspect });
}
