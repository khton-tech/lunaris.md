import type { StartupSnapshot, StartupStage, StartupState } from "@lunaris/startup";
import { createKernel } from "@lunaris/kernel";
import type { Kernel, KernelOptions, KernelSnapshot, Scheduler } from "@lunaris/kernel";
import type { ContractKind, Disposable, MaybePromise, PluginDefinition } from "@lunaris/sdk";
import { LunarisError } from "@lunaris/sdk";

/** Trusted host renderer adapter, never part of PluginContext. */
export interface ApplicationDefinition {
  readonly plugins: readonly PluginDefinition[];
  readonly selections?: readonly { readonly consumerId: string; readonly kind: ContractKind; readonly contractId: string; readonly providerId: string }[];
  readonly entrypoints: readonly string[];
  /** Trusted composition grants, applied after registration and before activation. */
  readonly grants?: Readonly<Record<string, readonly string[]>>;
  readonly view?: { readonly duringStartup?: boolean; mount(signal: AbortSignal): MaybePromise<Disposable> };
  /** Trusted ingress to a replaceable SDK startup provider. */
  readonly startup?: { update(snapshot: StartupSnapshot): boolean };
  /** Product-owned save/release gate, invoked before normal window closure. */
  readonly beforeClose?: () => Promise<boolean>;
}

export type HostPhase = "idle" | "starting" | "running" | "fallback" | "stopped";
export type FaultOrigin = "startup" | "runtime" | "view" | "cleanup";
export interface HostIncident {
  readonly sequence: number;
  readonly origin: FaultOrigin;
  readonly code: string;
  readonly pluginId?: string;
}
export interface HostSnapshot {
  readonly phase: HostPhase;
  readonly startup: StartupSnapshot;
  readonly busy: boolean;
  readonly applicationVisible: boolean;
  readonly recoveryBlocked: boolean;
  readonly kernelVersion: string;
  readonly sdkVersion: string;
  readonly kernel: KernelSnapshot;
  readonly disabled: readonly string[];
  readonly incidents: readonly HostIncident[];
}
export interface HostSessionOptions {
  readonly scheduler: Scheduler;
  readonly load: (signal: AbortSignal) => Promise<ApplicationDefinition>;
  readonly kernelOptions?: Omit<KernelOptions, "scheduler">;
  readonly viewTimeoutMs?: number;
}

const emptyKernel: KernelSnapshot = Object.freeze({ plugins: Object.freeze([]), diagnostics: Object.freeze([]) });
const fatalDiagnostics = new Set(["API_CALL_FAILED", "HOOK_FAILED", "EVENT_LISTENER_FAILED", "ACTIVATION_FAILED", "CLEANUP_FAILED", "STOP_TIMEOUT"]);

export class HostSession {
  #kernel: Kernel | undefined;
  #definition: ApplicationDefinition | undefined;
  #phase: HostPhase = "idle";
  #startup: StartupSnapshot = Object.freeze({ sequence: 0, state: "stopped", stage: "stopped" });
  #busy = false;
  #view: Disposable | undefined;
  #abort: AbortController | undefined;
  #disabled = new Set<string>();
  #incidents: HostIncident[] = [];
  #listeners = new Set<(snapshot: HostSnapshot) => void>();
  #tail: Promise<void> = Promise.resolve();
  #generation = 0;
  #sequence = 0;
  #diagnosticSequence = 0;
  #cleanupUnsafe = false;
  readonly #timeout: number;

  constructor(private readonly options: HostSessionOptions) {
    this.#timeout = options.viewTimeoutMs ?? 5000;
    if (!Number.isFinite(this.#timeout) || this.#timeout <= 0) throw new Error("Invalid host deadline.");
  }

  snapshot = (): HostSnapshot => Object.freeze({
    phase: this.#phase, startup: this.#startup, busy: this.#busy,
    applicationVisible: this.#view !== undefined && (this.#phase === "running" ||
      this.#phase === "starting" && this.#definition?.view?.duringStartup === true),
    recoveryBlocked: this.#cleanupUnsafe,
    kernelVersion: "0.1.0", sdkVersion: "0.1.0",
    kernel: this.#kernel?.inspect() ?? emptyKernel,
    disabled: Object.freeze([...this.#disabled].sort()), incidents: Object.freeze([...this.#incidents]),
  });

  subscribe(listener: (snapshot: HostSnapshot) => void): Disposable {
    this.#listeners.add(listener);
    try { listener(this.snapshot()); } catch { this.#listeners.delete(listener); }
    return { dispose: () => { this.#listeners.delete(listener); } };
  }

  #publish(): void {
    const snapshot = this.snapshot();
    for (const listener of this.#listeners) {
      try { listener(snapshot); } catch { this.#listeners.delete(listener); }
    }
  }

  #progress(state: StartupState, stage: StartupStage, pluginId?: string, errorCode?: string): void {
    this.#startup = Object.freeze({ sequence: this.#startup.sequence + 1, state, stage,
      ...(pluginId === undefined ? {} : { pluginId }), ...(errorCode === undefined ? {} : { errorCode }),
    });
    this.#definition?.startup?.update(this.#startup);
    this.#publish();
  }

  #incident(origin: FaultOrigin, code: string, pluginId?: string): void {
    this.#incidents.push(Object.freeze({ sequence: ++this.#sequence, origin, code, ...(pluginId ? { pluginId } : {}) }));
    if (this.#incidents.length > 20) this.#incidents.shift();
  }

  #enqueue(work: () => Promise<void>): Promise<void> {
    const result = this.#tail.then(async () => {
      this.#busy = true; this.#publish();
      try { await work(); }
      finally { this.#busy = false; this.#publish(); }
    });
    this.#tail = result.catch(() => {});
    return result;
  }

  #deadline<T>(work: Promise<T>, code: string, expire = () => {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const cancel = this.options.scheduler.schedule(this.#timeout, () => { expire(); reject(new Error(code)); });
      work.then(value => { cancel(); resolve(value); }, error => { cancel(); reject(error); });
    });
  }

  async #shutdown(): Promise<void> {
    this.#abort?.abort();
    const view = this.#view; this.#view = undefined;
    const errors: unknown[] = [];
    if (view) {
      try { await this.#deadline(Promise.resolve().then(() => view.dispose()), "VIEW_CLEANUP_TIMEOUT"); }
      catch (cause) { errors.push(cause); this.#incident("cleanup", "VIEW_CLEANUP_FAILED"); }
    }
    try { await this.#kernel?.stopAll(); }
    catch (cause) { errors.push(cause); this.#incident("cleanup", "PLUGIN_CLEANUP_FAILED"); }
    if (errors.length) {
      this.#cleanupUnsafe = true;
      throw new AggregateError(errors, "Host cleanup failed.");
    }
  }

  async #launch(generation: number): Promise<void> {
    if (generation !== this.#generation) return;
    if (this.#cleanupUnsafe) {
      this.#phase = "fallback";
      this.#incident("cleanup", "RECOVERY_REQUIRES_RESTART"); this.#publish();
      return;
    }
    let stage = "APPLICATION_CLEANUP_FAILED";
    let pluginId: string | undefined;
    this.#phase = "starting"; this.#publish();
    try {
      await this.#shutdown();
      if (generation !== this.#generation) return;
      this.#definition = undefined;
      this.#kernel = createKernel({ ...this.options.kernelOptions, scheduler: this.options.scheduler });
      this.#diagnosticSequence = 0;
      const abort = this.#abort = new AbortController();
      this.#progress("loading", "composition");
      stage = "APPLICATION_LOAD_FAILED";
      const definition = await this.#deadline(Promise.resolve().then(() => this.options.load(abort.signal)), "APPLICATION_LOAD_TIMEOUT", () => abort.abort());
      if (generation !== this.#generation) return;
      this.#definition = definition;
      this.#progress("loading", "registration");
      stage = "PLUGIN_REGISTRATION_FAILED";
      for (const plugin of definition.plugins) if (!this.#disabled.has(plugin.manifest.id)) {
        pluginId = plugin.manifest.id; this.#kernel.register(plugin);
      }
      for (const selection of definition.selections ?? []) {
        if (!this.#disabled.has(selection.consumerId)) this.#kernel.selectProvider(selection.consumerId, selection.kind, selection.contractId, selection.providerId);
      }
      for (const [id, permissions] of Object.entries(definition.grants ?? {})) {
        if (this.#disabled.has(id)) continue;
        pluginId = id;
        for (const permission of permissions) this.#kernel.grant(id, permission);
      }
      const mountView = async (): Promise<void> => {
        if (definition.view) {
          this.#progress("loading", "mounting");
          if (generation !== this.#generation) return;
          stage = "APPLICATION_MOUNT_FAILED"; pluginId = undefined;
          let accepted = false;
          let released = false;
          let resolvedView: Disposable | undefined;
          const mounting = Promise.resolve().then(() => definition.view!.mount(abort.signal));
          // A timed-out renderer may finish later; its detached target must be cleaned.
          const releaseLate = () => {
            if (resolvedView && abort.signal.aborted && !accepted && !released) {
              released = true;
              void Promise.resolve().then(() => resolvedView!.dispose()).catch(() => {
                this.#cleanupUnsafe = true;
                this.#incident("cleanup", "LATE_VIEW_CLEANUP_FAILED");
                void this.reportFault("cleanup", "RECOVERY_REQUIRES_RESTART"); this.#publish();
              });
            }
          };
          abort.signal.addEventListener("abort", releaseLate, { once: true });
          void mounting.then(view => { resolvedView = view; releaseLate(); }, () => {});
          const view = await this.#deadline(mounting, "APPLICATION_MOUNT_TIMEOUT", () => abort.abort());
          if (!view || typeof view.dispose !== "function") throw new Error("The host renderer must return a disposable.");
          if (generation !== this.#generation) return;
          accepted = true; this.#view = view; this.#publish();
          abort.signal.removeEventListener("abort", releaseLate);
        }
      };
      // Opt-in boot surfaces are visible before product entrypoints activate.
      // Preflight exclusions before exposing even an empty early surface.
      stage = "APPLICATION_START_FAILED";
      for (const id of definition.entrypoints) {
        if (this.#disabled.has(id)) { pluginId = id; throw new Error("Application entrypoint is disabled."); }
      }
      if (definition.view?.duringStartup) await mountView();
      if (generation !== this.#generation) return;
      for (const id of definition.entrypoints) {
        if (generation !== this.#generation) return;
        if (this.#disabled.has(id)) throw new Error("Application entrypoint is disabled.");
        pluginId = id;
        stage = "APPLICATION_START_FAILED";
        this.#progress("loading", "activation", id);
        if (generation !== this.#generation) return;
        await this.#kernel.start(id);
      }
      if (generation !== this.#generation) return;
      if (!definition.view?.duringStartup) await mountView();
      if (generation !== this.#generation) return;
      if (generation === this.#generation) {
        this.#progress("loaded", "ready");
        if (generation !== this.#generation) return;
        this.#phase = "running";
        this.refresh();
      }
    } catch (cause) {
      if (generation === this.#generation) {
        this.#phase = "fallback";
        this.#progress("failed", "failed", cause instanceof LunarisError ? cause.context.pluginId ?? pluginId : pluginId,
          cause instanceof LunarisError ? cause.code : stage);
        this.#incident(stage === "APPLICATION_MOUNT_FAILED" ? "view" : "startup",
          cause instanceof LunarisError ? cause.code : stage,
          cause instanceof LunarisError ? cause.context.pluginId ?? pluginId : pluginId);
      }
      this.#abort?.abort();
      try { await this.#shutdown(); } catch { /* Cleanup incidents are retained. */ }
    } finally { this.#publish(); }
  }

  start = (): Promise<void> => {
    const generation = ++this.#generation;
    return this.#enqueue(() => this.#launch(generation));
  };

  /** Rebuild the registry so dependency auto-start cannot reactivate disabled plugins. */
  disable = (pluginId: string): Promise<void> => {
    const generation = ++this.#generation;
    return this.#enqueue(async () => {
      if (generation !== this.#generation) return;
      if (!this.#definition?.plugins.some(plugin => plugin.manifest.id === pluginId)) throw new Error("Unknown plugin.");
      this.#disabled.add(pluginId);
      await this.#launch(generation);
    });
  };

  enable = (pluginId: string): Promise<void> => {
    const generation = ++this.#generation;
    return this.#enqueue(async () => {
      if (generation !== this.#generation) return;
      this.#disabled.delete(pluginId);
      await this.#launch(generation);
    });
  };

  reportFault = (origin: FaultOrigin = "runtime", code = "UNHANDLED_APPLICATION_ERROR", pluginId?: string): Promise<void> => {
    if (this.#phase === "fallback" || this.#phase === "stopped") return this.#tail;
    ++this.#generation;
    this.#phase = "fallback";
    this.#progress("failed", "failed", pluginId, code);
    this.#incident(origin, code, pluginId);
    this.#abort?.abort();
    this.#publish();
    return this.#enqueue(async () => {
      try { await this.#shutdown(); } catch { /* Keep the fallback available. */ }
    });
  };

  /** Called by the host monitor; normal permission denials do not crash the UI. */
  refresh = (): void => {
    const kernel = this.#kernel?.inspect();
    if (this.#phase === "running" && kernel) {
      const failed = kernel.plugins.find(plugin => plugin.state === "failed");
      const lost = this.#definition?.entrypoints.find(id => !this.#disabled.has(id) &&
        !kernel.plugins.some(plugin => plugin.manifest.id === id && plugin.state === "active"));
      const diagnostic = kernel.diagnostics.find(item => item.sequence > this.#diagnosticSequence && fatalDiagnostics.has(item.code));
      this.#diagnosticSequence = kernel.diagnostics.at(-1)?.sequence ?? this.#diagnosticSequence;
      if (failed || lost || diagnostic) {
        void this.reportFault("runtime", diagnostic?.code ?? "APPLICATION_PLUGIN_UNAVAILABLE", failed?.manifest.id ?? lost ?? diagnostic?.pluginId);
        return;
      }
    }
    this.#publish();
  };

  requestClose = async (): Promise<boolean> => {
    let allowed = false;
    await this.#enqueue(async () => {
      if (this.#phase === "running" && this.#definition?.beforeClose) {
        try { if (!await this.#definition.beforeClose()) return; }
        catch { this.#incident("runtime", "APPLICATION_CLOSE_BLOCKED"); this.#publish(); return; }
      }
      ++this.#generation; this.#phase = "stopped"; this.#progress("stopped", "stopped");
      this.#abort?.abort(); this.#publish();
      try { await this.#shutdown(); } catch { /* Incidents describe unsuccessful cleanup. */ }
      allowed = true;
    });
    return allowed;
  };

  stop = (): Promise<void> => {
    ++this.#generation;
    this.#phase = "stopped";
    this.#progress("stopped", "stopped");
    this.#abort?.abort(); this.#publish();
    return this.#enqueue(async () => {
      try { await this.#shutdown(); } catch { /* Incidents describe unsuccessful cleanup. */ }
    });
  };
}
