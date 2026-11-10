import { isValidId } from "@lunaris/manifest";
import { LunarisError } from "@lunaris/sdk";
import type { ContractToken, PluginContext } from "@lunaris/sdk";
import { context } from "./model.js";
import type { Activation, Registration } from "./model.js";
import type { Diagnostics } from "./diagnostics.js";
import type { KernelOptions } from "./types.js";

export class PermissionPolicy {
  #grants = new Map<string, Set<string>>();
  #initial = new Map<string, Set<string>>();
  #epochs = new Map<string, number>();
  #pending = new Map<string, Promise<boolean>>();
  readonly #request: KernelOptions["requestPermission"];

  constructor(private readonly records: ReadonlyMap<string, Registration>, private readonly diagnostics: Diagnostics, options: KernelOptions) {
    this.#request = options.requestPermission;
    if (this.#request !== undefined && typeof this.#request !== "function") throw new LunarisError("LIFECYCLE_INVALID", "Invalid permission request callback.");
    for (const [id, names] of Object.entries(options.initialGrants ?? {})) {
      if (!isValidId(id) || !Array.isArray(names) || names.some(name => !isValidId(name)) || new Set(names).size !== names.length) {
        throw new LunarisError("PERMISSION_DENIED", "Invalid initial grant declaration.");
      }
      this.#initial.set(id, new Set(names));
    }
  }

  #declared(record: Registration, name: string, optional = false): boolean {
    const manifest = record.definition.manifest;
    return manifest.optionalPermissions.includes(name) || (!optional && manifest.permissions.includes(name));
  }

  register(record: Registration, override?: readonly string[]): void {
    const id = record.definition.manifest.id;
    const initial = override === undefined ? this.#initial.get(id) ?? new Set<string>() : new Set(override);
    if ([...initial].some(name => !this.#declared(record, name))) throw new LunarisError("PERMISSION_DENIED", "Initial grant was not requested by this manifest.", { pluginId: id });
    this.#grants.set(id, new Set(initial));
  }

  #deny(record: Registration, contractId?: string): never {
    const error = new LunarisError("PERMISSION_DENIED", "Permission was not declared or is not currently granted.", { ...context(record), ...(contractId ? { contractId } : {}) });
    this.diagnostics.record("PERMISSION_DENIED", error.context, error);
    throw error;
  }

  authorize = (record: Registration, token: ContractToken, role: "provide" | "consume"): void => {
    const permission = role === "provide" ? token.providePermission : token.consumePermission;
    if (permission && (!this.#declared(record, permission) || !this.#grants.get(record.definition.manifest.id)?.has(permission))) this.#deny(record, token.id);
  };

  #target(id: string, permission: string): Registration {
    const record = this.records.get(id);
    if (!record) throw new LunarisError("PLUGIN_NOT_FOUND", "Plugin is not registered.", { pluginId: id });
    if (!this.#declared(record, permission)) this.#deny(record);
    return record;
  }

  grant = (id: string, permission: string): void => {
    this.#target(id, permission);
    this.#grants.get(id)!.add(permission);
    const key = `${id}/${permission}`; this.#epochs.set(key, (this.#epochs.get(key) ?? 0) + 1);
  };

  revoke = (id: string, permission: string): void => {
    this.#target(id, permission);
    this.#grants.get(id)!.delete(permission);
    const key = `${id}/${permission}`; this.#epochs.set(key, (this.#epochs.get(key) ?? 0) + 1);
  };

  effective(id: string): readonly string[] { return Object.freeze([...(this.#grants.get(id) ?? [])].sort()); }

  unregister(id: string): void {
    this.#grants.delete(id);
    for (const key of this.#epochs.keys()) if (key.startsWith(`${id}/`)) this.#epochs.delete(key);
  }

  #has(record: Registration, activation: Activation, permission: string, optional = false): boolean {
    activation.scope.assertOpen();
    if (record.activation !== activation) throw new LunarisError("SCOPE_CLOSED", "Stale permission context.", context(record, activation));
    if (!this.#declared(record, permission, optional)) this.#deny(record);
    return this.#grants.get(record.definition.manifest.id)!.has(permission);
  }

  #optional(record: Registration, activation: Activation, permission: string): Promise<boolean> {
    try { if (this.#has(record, activation, permission, true)) return Promise.resolve(true); }
    catch (error) { return Promise.reject(error); }
    const id = record.definition.manifest.id;
    const pendingKey = `${activation.id}/${permission}`;
    const existing = this.#pending.get(pendingKey);
    if (existing) return existing;
    const epochKey = `${id}/${permission}`;
    const epoch = this.#epochs.get(epochKey) ?? 0;
    let resolve!: (value: boolean) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<boolean>((yes, no) => { resolve = yes; reject = no; });
    this.#pending.set(pendingKey, promise);
    let settled = false;
    const finish = (value: boolean, error?: unknown) => {
      if (settled) return;
      settled = true;
      this.#pending.delete(pendingKey);
      activation.scope.facade.signal.removeEventListener("abort", abort);
      if (error === undefined) resolve(value); else reject(error);
    };
    const abort = () => finish(false);
    activation.scope.facade.signal.addEventListener("abort", abort, { once: true });
    const request = Object.freeze({ pluginId: id, activationId: activation.id, permission });
    void Promise.resolve().then(() => activation.scope.closed ? false : this.#request?.(request) ?? false).then(approved => {
      if (settled || activation.scope.closed || record.activation !== activation) { finish(false); return; }
      if ((this.#epochs.get(epochKey) ?? 0) === epoch && approved === true) this.#grants.get(id)!.add(permission);
      const granted = this.#grants.get(id)!.has(permission);
      if (!granted) this.diagnostics.record("PERMISSION_DENIED", context(record, activation));
      finish(granted);
    }, cause => {
      this.diagnostics.record("PERMISSION_REQUEST_FAILED", context(record, activation), cause);
      finish(false, new LunarisError("PERMISSION_REQUEST_FAILED", "Host permission callback failed.", context(record, activation), { cause }));
    });
    return promise;
  }

  facade(record: Registration, activation: Activation): PluginContext["permissions"] {
    return Object.freeze({ has: (permission: string) => this.#has(record, activation, permission),
      request: (permission: string) => this.#optional(record, activation, permission) });
  }
}
