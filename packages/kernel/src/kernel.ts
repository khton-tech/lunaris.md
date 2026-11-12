import { validateManifest } from "@lunaris/manifest";
import { capturePackageResources, contractKey, definePlugin, LunarisError } from "@lunaris/sdk";
import type { ApiToken, ContractKind, ErrorCode, PluginContext, PluginDefinition, PackageResourceFiles } from "@lunaris/sdk";
import { Diagnostics } from "./diagnostics.js";
import { OwnedScope } from "./scope.js";
import type { Kernel, KernelOptions, KernelSnapshot, PluginState, Scheduler } from "./types.js";

import { context, requirementKey } from "./model.js";
import type { Activation, Registration } from "./model.js";
import { candidates, resolve } from "./resolver.js";
import type { Plan } from "./resolver.js";
import { DependencyIndex } from "./dependency-index.js";
import { Access } from "./access.js";
import { ApiRuntime } from "./api.js";
import { DispatchRuntime } from "./dispatch.js";
import { PermissionPolicy } from "./permissions.js";

class Runtime {
  #plugins = new Map<string, Registration>();
  #nextActivation = 0;
  #selections = new Map<string, string>();
  #dependencies = new DependencyIndex();
  #starts = new Map<Registration, Set<ReadonlyMap<string, string | undefined>>>();
  readonly #access: Access;
  readonly #api: ApiRuntime;
  readonly #dispatch: DispatchRuntime;
  readonly #permissions: PermissionPolicy;
  #callbackDepth = 0;
  #mutating = false;
  readonly #diagnostics: Diagnostics;
  readonly #scheduler: Scheduler;
  readonly #activationTimeout: number;
  readonly #stopTimeout: number;
  readonly #onChange: KernelOptions["onChange"];
  #changeQueued = false;

  constructor(options: KernelOptions) {
    if (!options || typeof options.scheduler?.schedule !== "function") {
      throw new LunarisError("LIFECYCLE_INVALID", "A host scheduler is required.");
    }
    this.#scheduler = options.scheduler;
    this.#activationTimeout = options.activationTimeoutMs ?? 5000;
    this.#stopTimeout = options.stopTimeoutMs ?? 5000;
    this.#onChange = options.onChange;
    if (this.#onChange !== undefined && typeof this.#onChange !== "function") {
      throw new LunarisError("LIFECYCLE_INVALID", "The host change observer must be a function.");
    }
    const capacity = options.diagnosticCapacity ?? 100;
    if (![this.#activationTimeout, this.#stopTimeout].every(value => Number.isFinite(value) && value > 0) ||
      !Number.isSafeInteger(capacity) || capacity <= 0) {
      throw new LunarisError("LIFECYCLE_INVALID", "Deadlines must be positive finite durations and diagnostic capacity a positive integer.");
    }
    this.#diagnostics = new Diagnostics(capacity, this.#changed);
    this.#permissions = new PermissionPolicy(this.#plugins, this.#diagnostics, options, this.#changed);
    this.#access = new Access(this.#permissions.authorize, this.#invoke);
    this.#dispatch = new DispatchRuntime(this.#access, this.#diagnostics);
    this.#api = new ApiRuntime(this.#access, this.#diagnostics, (provider, activation, key) => {
      void this.#stopDependents(provider, activation, key).catch(cause => this.#diagnostics.record("CLEANUP_FAILED", context(provider, activation), cause));
    });
  }

  #context(record: Registration) {
    return { pluginId: record.definition.manifest.id, state: record.state,
      ...(record.activation ? { activationId: record.activation.id } : {}) };
  }

  #changed = (): void => {
    if (!this.#onChange || this.#changeQueued) return;
    this.#changeQueued = true;
    void Promise.resolve().then(() => {
      this.#changeQueued = false;
      return this.#onChange!();
    }).catch(() => { /* Host observation must not affect plugin operations. */ });
  };

  #state(record: Registration, state: PluginState): void {
    if (record.state === state) return;
    record.state = state;
    this.#changed();
  }

  #invoke = <T>(callback: () => T): T => {
    this.#callbackDepth++;
    try { return callback(); } finally { this.#callbackDepth--; }
  };

  #guard(): void {
    if (this.#callbackDepth) throw new LunarisError("LIFECYCLE_REENTRANT", "Management cannot reenter a plugin callback.");
  }

  #externalGuard(): void {
    this.#guard();
    if (this.#mutating) throw new LunarisError("LIFECYCLE_INVALID", "A registry mutation is in progress; await it before management calls.");
  }

  register = (definition: PluginDefinition, options: { readonly ownerId?: string; readonly resources?: PackageResourceFiles } = {}): void => {
    this.#externalGuard();
    this.#register(definition, options.ownerId, undefined, capturePackageResources(options.resources));
  };

  #register(definition: PluginDefinition, ownerId?: string, grants?: readonly string[], resources = capturePackageResources()): void {
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
    if (ownerId !== undefined && (ownerId === id || !this.#plugins.has(ownerId))) throw new LunarisError('LIFECYCLE_INVALID', 'Lifecycle owner must be a different registered plugin.', { pluginId: id });
    const record: Registration = { definition: checked, resources, ...(ownerId === undefined ? {} : { ownerId }), state: "registered", tail: Promise.resolve() };
    this.#permissions.register(record, grants);
    this.#plugins.set(id, record);
    this.#dependencies.register(checked.manifest);
    if (ownerId !== undefined) this.#dependencies.own(id, ownerId);
    this.#changed();
  }

  #enqueue(id: string, operation: (record: Registration) => Promise<void>, internal = false, stopping = false): Promise<void> {
    try {
      if (!internal) this.#guard();
      const record = this.#plugins.get(id);
      if (!record) throw new LunarisError("PLUGIN_NOT_FOUND", "Plugin is not registered.", { pluginId: id });
      record.pending = (record.pending ?? 0) + 1;
      if (stopping) record.pendingStops = (record.pendingStops ?? 0) + 1;
      const result = record.tail.then(() => operation(record)).finally(() => {
        record.pending!--;
        if (stopping) record.pendingStops!--;
      });
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

  #pluginContext(record: Registration, activation: Activation): PluginContext {
    return Object.freeze({
      pluginId: record.definition.manifest.id, activationId: activation.id,
      signal: activation.scope.facade.signal, scope: activation.scope.facade,
      resources: record.resources(activation.scope.facade.signal),
      provide: <T extends object>(token: ApiToken<T>, implementation: T) => this.#api.provide(record, activation, token, implementation),
      use: <T extends object>(token: ApiToken<T>): T => this.#api.use(record, activation, token, false)!,
      optional: <T extends object>(token: ApiToken<T>): T | undefined => this.#api.use(record, activation, token, true),
      events: this.#dispatch.events(record, activation),
      hooks: this.#dispatch.hooks(record, activation),
      permissions: this.#permissions.facade(record, activation),
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

  #disposeRoot(record: Registration, activation: Activation): Promise<void> {
    const scope = activation.scope;
    // Activation rollback and completed/stale scopes already have local cleanup.
    if (record.activation !== activation || record.state !== "active") {
      if (record.state === "stopping" && !scope.closed) {
        return Promise.reject(new LunarisError("LIFECYCLE_REENTRANT", "Root shutdown is already waiting for dependent cleanup.", context(record, activation)));
      }
      return scope.dispose();
    }
    const stopping = this.#reserveStops([record])[0]!;
    this.#state(record, "stopping");
    // Revoke access immediately, but retain owned resources until dependents stop.
    scope.close();
    return stopping;
  }

  async #activate(record: Registration, selected: Map<string, string | undefined> = new Map(), planningError?: unknown): Promise<void> {
    if (record.state === "active" && record.activation && !record.activation.scope.closed) return;
    if (!["registered", "stopped", "failed"].includes(record.state)) throw new LunarisError("LIFECYCLE_INVALID", "Cannot start in this state.", this.#context(record));
    this.#state(record, "resolving");
    const id = `${record.definition.manifest.id}:${++this.#nextActivation}`;
    const apis: Activation["apis"] = new Map();
    const tokens: Activation["tokens"] = new Map();
    const bindings: Activation["bindings"] = new Map();
    const scope = new OwnedScope({ pluginId: record.definition.manifest.id, activationId: id }, this.#invoke,
      cause => this.#diagnostics.record("CLEANUP_FAILED", { pluginId: record.definition.manifest.id, activationId: id, state: record.state }, cause),
      () => {
        this.#access.release(activation);
        apis.clear(); tokens.clear();
        if (record.state !== "stopping") void this.#stopDependents(record, activation).catch(cause => this.#diagnostics.record("CLEANUP_FAILED", context(record, activation), cause));
      }, undefined, undefined, () => this.#disposeRoot(record, activation), this.#changed);
    const activation: Activation = { id, scope, apis, tokens, bindings };
    record.activation = activation;
    const timeout = new LunarisError("ACTIVATION_TIMEOUT", "Activation deadline expired; JavaScript may still be running.", this.#context(record));
    let resolutionFailure: LunarisError | undefined;
    let requiredContractId: string | undefined;
    let detached = false;
    try {
      if (planningError) {
        resolutionFailure = planningError instanceof LunarisError ? planningError :
          new LunarisError("LIFECYCLE_INVALID", "Dependency planning failed.", context(record), { cause: planningError });
        throw resolutionFailure;
      }
      if (record.ownerId) {
        const owner = this.#plugins.get(record.ownerId);
        if (owner?.state !== 'active' || !owner.activation || owner.activation.scope.closed) throw new LunarisError('PROVIDER_UNAVAILABLE', 'Lifecycle owner is not active.', { pluginId: record.definition.manifest.id });
      }
      for (const requirement of record.definition.manifest.requires) {
        const key = requirementKey(requirement);
        const providerId = selected.get(key);
        const provider = providerId ? this.#plugins.get(providerId) : undefined;
        const provided = provider?.definition.manifest.provides.find(item => requirementKey(item) === key);
        if (provider?.state === "active" && provider.activation && !provider.activation.scope.closed && provided) {
          bindings.set(key, { requirement, provider, activation: provider.activation, version: provided.version });
        } else {
          bindings.set(key, undefined);
          if (!requirement.optional) {
            requiredContractId = requirement.id;
            resolutionFailure = new LunarisError("PROVIDER_UNAVAILABLE", "Required provider failed to activate.", { ...context(record), contractId: requirement.id });
            throw resolutionFailure;
          }
        }
      }
      this.#state(record, "starting");
      const pluginContext = this.#pluginContext(record, activation);
      const work = Promise.resolve().then(() => this.#invoke(() => record.definition.activate(pluginContext))).then(teardown => {
        if (teardown !== undefined) scope.teardown(teardown);
      }).catch(cause => {
        if (detached) this.#diagnostics.record("ACTIVATION_FAILED", { pluginId: record.definition.manifest.id, activationId: id, state: "failed" }, cause);
        throw cause;
      });
      await this.#deadline(work, this.#activationTimeout, timeout, () => scope.close(timeout));
      scope.assertOpen();
      for (const provided of record.definition.manifest.provides) {
        if (provided.kind === "api" && !apis.has(contractKey(provided))) {
          throw new LunarisError("CONTRACT_UNAVAILABLE", "Advertised API was not published during activation.", { ...context(record), contractId: provided.id });
        }
      }
      for (const token of tokens.values()) this.#access.check(record, activation, token,
        record.definition.manifest.provides.some(p => p.kind === token.kind && p.id === token.id && p.version === token.version) ? "provide" : "consume");
      for (const binding of bindings.values()) if (binding && !binding.requirement.optional) this.#access.available(binding, { ...binding.requirement, version: binding.version });
      this.#access.commit(activation);
      this.#state(record, "active");
    } catch (cause) {
      detached = true;
      this.#state(record, "failed");
      scope.close(cause);
      const code: ErrorCode = cause === timeout ? "ACTIVATION_TIMEOUT" :
        resolutionFailure !== undefined && cause === resolutionFailure ? resolutionFailure.code : "ACTIVATION_FAILED";
      this.#diagnostics.record(code, { ...this.#context(record),
        ...(requiredContractId ? { contractId: requiredContractId } : {}) }, cause);
      let combined: unknown = cause;
      try { await this.#cleanup(record, activation); }
      catch (cleanup) { combined = new AggregateError([cause, cleanup], "Activation and rollback failed."); }
      throw new LunarisError(code, "Plugin activation failed.", this.#context(record), { cause: combined });
    }
  }

  async #stop(record: Registration, dependents: readonly Promise<void>[]): Promise<void> {
    const activation = record.activation;
    const cleanup = activation && record.state !== "registered" && record.state !== "stopped";
    if (cleanup) this.#state(record, "stopping");
    const results = await Promise.allSettled(dependents);
    const errors = results.flatMap(result => result.status === "rejected" ? [result.reason as unknown] : []);
    const dependencyError = errors.length ? new LunarisError("CLEANUP_FAILED", "Dependent shutdown failed.", context(record), { cause: new AggregateError(errors) }) : undefined;
    if (!cleanup) { if (dependencyError) throw dependencyError; return; }
    activation.scope.close();
    try { await this.#cleanup(record, activation); this.#state(record, "stopped"); if (dependencyError) throw dependencyError; }
    catch (cause) { this.#state(record, "failed"); throw cause; }
  }

  #dependents(provider: Registration, activation = provider.activation, key?: string): Registration[] {
    const providerId = provider.definition.manifest.id;
    return [...this.#plugins.values()].filter(record => record !== provider && (
      (record.ownerId === providerId && (record.state === 'active' || record.state === 'starting' || record.state === 'stopping' || !!record.pending)) ||
      (record.activation && (!record.activation.scope.closed || record.state === "stopping") && [...record.activation.bindings].some(([bindingKey, binding]) =>
        binding?.provider === provider && binding.activation === activation && !binding.requirement.optional && (!key || key === bindingKey))) ||
      [...this.#starts.get(record) ?? []].some(selected => record.definition.manifest.requires.some(requirement =>
        !requirement.optional && (!key || key === requirementKey(requirement)) && selected.get(requirementKey(requirement)) === providerId))))
      .sort((a, b) => a.definition.manifest.id < b.definition.manifest.id ? 1 : -1);
  }

  #reserveStops(roots: readonly Registration[], ready = Promise.resolve()): Promise<void>[] {
    const scheduled = new Map<Registration, Promise<void>>();
    const visiting = new Set<Registration>();
    const visit = (record: Registration): Promise<void> => {
      const prior = scheduled.get(record);
      if (prior) return prior;
      if (visiting.has(record)) throw new LunarisError("DEPENDENCY_CYCLE", "Required shutdown graph contains a cycle.", context(record));
      visiting.add(record);
      const dependents = this.#dependents(record).map(visit);
      visiting.delete(record);
      // All prerequisites are reserved synchronously. A running stop never queues
      // work behind a later start that is waiting for this stop's own queue.
      const operation = this.#enqueue(record.definition.manifest.id, async current => {
        await ready;
        await this.#stop(current, dependents);
      }, true, true);
      scheduled.set(record, operation);
      return operation;
    };
    return roots.map(visit);
  }

  async #stopDependents(provider: Registration, activation: Activation, key?: string): Promise<void> {
    const results = await Promise.allSettled(this.#reserveStops(this.#dependents(provider, activation, key)));
    const errors = results.flatMap(result => result.status === "rejected" ? [result.reason as unknown] : []);
    if (errors.length) {
      throw new LunarisError("CLEANUP_FAILED", "Dependent shutdown failed.", context(provider, activation), { cause: new AggregateError(errors) });
    }
  }

  start = async (id: string): Promise<void> => {
    this.#externalGuard();
    await this.#start(id);
  };

  async #start(id: string): Promise<void> {
    let plan: Plan;
    try { plan = resolve(id, this.#plugins, this.#selections, this.#dependencies); }
    catch (error) { await this.#enqueue(id, record => this.#activate(record, new Map(), error)); return; }
    for (const omitted of plan.omitted) this.#diagnostics.record("DEPENDENCY_CYCLE", omitted);
    // Reserve the root queue before yielding to dependency activation.
    // No queue is held while recursively enqueueing graph operations.
    let preceding = Promise.resolve();
    for (const next of plan.order) {
      const ready = preceding;
      const record = this.#plugins.get(next)!;
      const selected = plan.edges.get(next)!;
      let starts = this.#starts.get(record);
      if (!starts) this.#starts.set(record, starts = new Set());
      starts.add(selected);
      const operation = this.#enqueue(next, async record => {
        try { await ready; await this.#activate(record, selected); }
        finally {
          starts.delete(selected);
          if (!starts.size) this.#starts.delete(record);
        }
      });
      preceding = next === id ? operation : operation.catch(() => {});
    }
    await preceding;
  }
  stop = async (id: string): Promise<void> => {
    this.#externalGuard();
    await this.#stopId(id);
  };

  async #stopId(id: string): Promise<void> {
    const record = this.#plugins.get(id);
    if (!record) { await this.#enqueue(id, async () => {}); return; }
    await this.#reserveStops([record])[0];
  }
  restart = async (id: string): Promise<void> => { this.#guard(); await this.stop(id); await this.start(id); };

  selectProvider = (consumerId: string, kind: ContractKind, contractId: string, providerId: string): void => {
    this.#externalGuard();
    const consumer = this.#plugins.get(consumerId);
    if (!consumer) throw new LunarisError("PLUGIN_NOT_FOUND", "Consumer is not registered.", { pluginId: consumerId });
    if (consumer.pending || ["resolving", "starting", "active", "stopping"].includes(consumer.state)) throw new LunarisError("LIFECYCLE_INVALID", "Stop the consumer before changing selection.", context(consumer));
    const requirement = consumer.definition.manifest.requires.find(r => r.kind === kind && r.id === contractId);
    if (!requirement || !candidates(this.#plugins, requirement, this.#dependencies.providers).includes(providerId)) throw new LunarisError("PROVIDER_MISSING", "Selected provider does not match the requirement.", { pluginId: consumerId, contractId });
    this.#selections.set(consumerId + "/" + requirementKey(requirement), providerId);
  };

  stopAll = async (): Promise<void> => {
    this.#externalGuard();
    const records = [...this.#plugins.keys()].sort().reverse().map(id => this.#plugins.get(id)!);
    const ready = Promise.all(records.map(record => record.tail)).then(() => {});
    const results = await Promise.allSettled(this.#reserveStops(records, ready));
    const errors = results.flatMap(result => result.status === "rejected" ? [result.reason as unknown] : []);
    if (errors.length) throw new LunarisError("CLEANUP_FAILED", "One or more plugins failed to stop.", {}, { cause: new AggregateError(errors) });
  };

  rebindProvider = async (consumerId: string, kind: ContractKind, contractId: string, providerId: string): Promise<void> => {
    this.#externalGuard();
    const consumer = this.#plugins.get(consumerId);
    const requirement = consumer?.definition.manifest.requires.find(item => item.kind === kind && item.id === contractId);
    if (!consumer || !requirement || !candidates(this.#plugins, requirement, this.#dependencies.providers).includes(providerId)) throw new LunarisError('PROVIDER_MISSING', 'Selected provider does not match the requirement.', { pluginId: consumerId, contractId });
    const key = consumerId + '/' + requirementKey(requirement);
    if (this.#selections.get(key) === providerId) return;
    this.#beginMutation(consumerId);
    const affected = this.#affected(consumer);
    const active = affected.filter(record => record.state === 'active').map(record => record.definition.manifest.id);
    const selections = new Map(this.#selections);
    const stop = async (records: readonly Registration[]): Promise<void> => {
      const outcomes = await Promise.allSettled(this.#reserveStops(records));
      const failures = outcomes.flatMap(outcome => outcome.status === 'rejected' ? [outcome.reason as unknown] : []);
      if (failures.length) throw new LunarisError('CLEANUP_FAILED', 'Provider transition cleanup failed.', { pluginId: consumerId }, { cause: new AggregateError(failures) });
    };
    try {
      await stop(affected);
      this.#selections.set(key, providerId);
      try { for (const id of active) await this.#start(id); }
      catch (cause) {
        try {
          await stop([...new Set([...affected, ...this.#affected(consumer)])]);
          this.#selections = selections;
          for (const id of active) await this.#start(id);
        } catch (rollback) {
          this.#selections = selections;
          throw new LunarisError('CLEANUP_FAILED', 'Provider transition and rollback failed; recovery is required.', { pluginId: consumerId }, { cause: new AggregateError([cause, rollback]) });
        }
        throw new LunarisError('ACTIVATION_FAILED', 'Provider transition failed; previous selection and active consumers restored.', { pluginId: consumerId }, { cause });
      }
    } finally { this.#mutating = false; }
  };

  grant = (id: string, permission: string): void => {
    if (this.#mutating) throw new LunarisError("LIFECYCLE_INVALID", "Cannot change grants during registry mutation.");
    this.#permissions.grant(id, permission);
  };
  revoke = (id: string, permission: string): void => {
    if (this.#mutating) throw new LunarisError("LIFECYCLE_INVALID", "Cannot change grants during registry mutation.");
    this.#permissions.revoke(id, permission);
  };

  #restoreGrants(definition: PluginDefinition, grants: readonly string[]): void {
    const id = definition.manifest.id;
    for (const name of this.#permissions.effective(id)) this.#permissions.revoke(id, name);
    for (const name of grants) if ([...definition.manifest.permissions, ...definition.manifest.optionalPermissions].includes(name)) this.#permissions.grant(id, name);
  }

  /** Registry mutations require a quiescent graph and reserve the boundary before awaiting. */
  #beginMutation(id: string): Registration {
    this.#externalGuard();
    const record = this.#plugins.get(id);
    if (!record) throw new LunarisError("PLUGIN_NOT_FOUND", "Plugin is not registered.", { pluginId: id });
    if ([...this.#plugins.values()].some(item => item.pending || ["starting", "resolving", "stopping"].includes(item.state))) {
      throw new LunarisError("LIFECYCLE_INVALID", "Await pending lifecycle operations before changing the registry.", { pluginId: id });
    }
    this.#mutating = true;
    return record;
  }

  #affected(root: Registration): Registration[] {
    const affected = new Set([root]);
    for (const provider of affected) for (const record of this.#plugins.values()) {
      if (record.state === "active" && record.activation && (record.ownerId === provider.definition.manifest.id || [...record.activation.bindings.values()].some(binding => binding?.provider === provider))) affected.add(record);
    }
    return [...affected];
  }

  #remove(record: Registration): void {
    const id = record.definition.manifest.id;
    this.#plugins.delete(id);
    this.#dependencies.unregister(id);
    this.#permissions.unregister(id);
    this.#starts.delete(record);
    this.#changed();
  }

  unregister = async (id: string): Promise<void> => {
    const record = this.#beginMutation(id);
    try {
      // Include optional consumers so they never retain seemingly usable stale bindings.
      const affected = this.#affected(record);
      const results = await Promise.allSettled(this.#reserveStops(affected));
      const errors = results.flatMap(result => result.status === "rejected" ? [result.reason as unknown] : []);
      if (errors.length) throw new LunarisError("CLEANUP_FAILED", "Unregistration cleanup failed; registration retained for recovery.", { pluginId: id }, { cause: new AggregateError(errors) });
      this.#remove(record);
      for (const [key, provider] of this.#selections) if (key.startsWith(`${id}/`) || provider === id) this.#selections.delete(key);
    } finally { this.#mutating = false; }
  };

  replace = async (definition: PluginDefinition, options: { readonly grants?: readonly string[]; readonly resources?: PackageResourceFiles } = {}): Promise<void> => {
    // Validate the candidate before stopping anything or reserving a mutation.
    const checked = definePlugin(definition);
    const resources = capturePackageResources(options.resources);
    const compatibility = validateManifest(checked.manifest, { engineVersion: "0.1.0", sdkVersion: "0.1.0" });
    if (!compatibility.ok) throw new LunarisError("VERSION_INCOMPATIBLE", "Replacement is incompatible.", { pluginId: checked.manifest.id }, { cause: compatibility.diagnostics });
    const id = checked.manifest.id;
    const requested = options.grants === undefined ? undefined : [...options.grants];
    const declared = [...checked.manifest.permissions, ...checked.manifest.optionalPermissions];
    if (requested && (new Set(requested).size !== requested.length || requested.some(name => !declared.includes(name)))) throw new LunarisError('PERMISSION_DENIED', 'Replacement grants must be unique declared permissions.', { pluginId: id });
    const previous = this.#beginMutation(id);
    const active = this.#affected(previous).filter(record => record.state === "active").map(record => record.definition.manifest.id);
    const grants = this.#permissions.effective(id);
    const selections = new Map(this.#selections);
    let installed = false;
    try {
      const results = await Promise.allSettled(this.#reserveStops(this.#affected(previous)));
      const errors = results.flatMap(result => result.status === "rejected" ? [result.reason as unknown] : []);
      if (errors.length) throw new LunarisError("CLEANUP_FAILED", "Replacement cleanup failed; old registration retained.", { pluginId: id }, { cause: new AggregateError(errors) });
      this.#remove(previous);
      installed = true;
      try {
        const nextGrants = requested ?? grants.filter(name => declared.includes(name));
        this.#register(checked, previous.ownerId, nextGrants, resources);
        this.#restoreGrants(checked, nextGrants);
        // A changed consumer declaration cannot inherit invalid selections.
        for (const key of this.#selections.keys()) if (key.startsWith(`${id}/`) && !checked.manifest.requires.some(requirement => key === `${id}/${requirementKey(requirement)}`)) this.#selections.delete(key);
        for (const consumer of active) await this.#start(consumer);
      } catch (cause) {
        const rollbackErrors: unknown[] = [];
        try {
          const candidate = this.#plugins.get(id);
          if (candidate) {
            const stopped = await Promise.allSettled(this.#reserveStops(this.#affected(candidate)));
            for (const result of stopped) if (result.status === "rejected") rollbackErrors.push(result.reason);
            if (rollbackErrors.length) throw new AggregateError(rollbackErrors, "Candidate cleanup failed.");
            this.#remove(candidate);
          }
          this.#selections = selections;
          this.#register(previous.definition, previous.ownerId, grants, previous.resources);
          this.#restoreGrants(previous.definition, grants);
          for (const consumer of active) await this.#start(consumer);
        } catch (rollback) {
          throw new LunarisError("CLEANUP_FAILED", "Replacement and rollback failed; recovery is required.", { pluginId: id }, { cause: new AggregateError([cause, rollback]) });
        }
        throw new LunarisError("ACTIVATION_FAILED", "Replacement failed; previous code and active graph restored. Data side effects are not rolled back.", { pluginId: id }, { cause });
      }
    } finally {
      // A stop failure never removes the old registration.
      if (!installed) this.#selections = selections;
      this.#mutating = false;
    }
  };

  diagnosticCause = (sequence: number): Readonly<{ cause: unknown }> | undefined => this.#diagnostics.cause(sequence);

  inspect = (): KernelSnapshot => Object.freeze({
    plugins: Object.freeze([...this.#plugins.values()].sort((a, b) => a.definition.manifest.id < b.definition.manifest.id ? -1 : 1).map(record => Object.freeze({
      manifest: record.definition.manifest, state: record.state,
      ...(record.ownerId === undefined ? {} : { ownerId: record.ownerId }),
      ...(record.activation ? { activationId: record.activation.id } : {}),
      contracts: Object.freeze(record.state === "active" && !record.activation?.scope.closed ? [
        ...record.activation!.apis.keys(), ...record.definition.manifest.provides.filter(p => p.kind !== "api").map(p => contractKey(p)),
      ].sort() : []),
      ownedResources: record.activation?.scope.resourceCount ?? 0,
      effectivePermissions: this.#permissions.effective(record.definition.manifest.id),
      bindings: Object.freeze([...record.activation?.bindings ?? []].map(([contract, binding]) => Object.freeze({ contract,
        ...(binding ? { providerId: binding.provider.definition.manifest.id, activationId: binding.activation.id, version: binding.version } : {}) }))),
    }))),
    diagnostics: this.#diagnostics.snapshot(),
  });
}

export function createKernel(options: KernelOptions): Kernel {
  const runtime = new Runtime(options);
  return Object.freeze({ register: runtime.register, unregister: runtime.unregister, replace: runtime.replace, start: runtime.start, stop: runtime.stop,
    restart: runtime.restart, selectProvider: runtime.selectProvider, rebindProvider: runtime.rebindProvider, grant: runtime.grant, revoke: runtime.revoke, stopAll: runtime.stopAll, inspect: runtime.inspect,
    diagnosticCause: runtime.diagnosticCause });
}
