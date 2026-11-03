import { contractKey, LunarisError } from "@lunaris/sdk";
import type { ApiToken, Disposable } from "@lunaris/sdk";
import { context } from "./model.js";
import type { Activation, Registration } from "./model.js";
import type { Access } from "./access.js";
import type { Diagnostics } from "./diagnostics.js";

export class ApiRuntime {
  constructor(private readonly access: Access, private readonly diagnostics: Diagnostics,
    private readonly lost: (provider: Registration, activation: Activation, key?: string) => void) {}

  provide<T extends object>(record: Registration, activation: Activation, token: ApiToken<T>, implementation: T): Disposable {
    this.access.check(record, activation, token, "provide");
    if (token.kind !== "api" || implementation === null || typeof implementation !== "object" ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(implementation))) {
      throw new LunarisError("VALIDATION_FAILED", "Expected an API token and a plain method object.", context(record));
    }
    const methods = new Map<PropertyKey, (...args: never[]) => unknown>();
    for (const key of Reflect.ownKeys(implementation)) {
      const descriptor = Object.getOwnPropertyDescriptor(implementation, key);
      if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "function") {
        throw new LunarisError("VALIDATION_FAILED", "API implementation contains a non-method field.", context(record));
      }
      methods.set(key, descriptor.value as (...args: never[]) => unknown);
    }
    this.access.validate(token, implementation);
    this.access.check(record, activation, token, "provide");
    const key = contractKey(token);
    if (activation.apis.has(key)) throw new LunarisError("CONTRACT_METADATA_CONFLICT", "API is already provided.", context(record));
    const entry = { token: Object.freeze({ ...token }), implementation, methods };
    activation.apis.set(key, entry);
    let disposed = false;
    const registration = Object.freeze({ dispose: () => {
      if (disposed) return;
      disposed = true;
      activation.scope.release(registration);
      if (activation.apis.get(key) === entry) {
        activation.apis.delete(key);
        if (!activation.scope.closed && record.state === "active") this.lost(record, activation, `api:${token.id}`);
      }
    } });
    activation.scope.own(registration);
    return registration;
  }

  use<T extends object>(record: Registration, activation: Activation, token: ApiToken<T>, optional: boolean): T | undefined {
    if (token.kind !== "api") throw new LunarisError("CONTRACT_METADATA_CONFLICT", "Expected an API token.");
    const binding = this.access.binding(record, activation, token, optional ? "optional" : "require");
    if (!binding) return undefined;
    token = Object.freeze({ ...token });
    const key = `api:${token.id}@${binding.version}`;
    const entry = binding.activation.apis.get(key);
    if (!entry) throw new LunarisError("PROVIDER_UNAVAILABLE", "Provider did not publish the required API.", { ...context(record), contractId: token.id });
    this.access.compatible(entry.token, token);
    this.access.authorize(binding.provider, entry.token, "provide");
    this.access.validate(token, entry.implementation);
    const handle = Object.create(null) as Record<PropertyKey, unknown>;
    for (const [name, method] of entry.methods) {
      handle[name] = (...args: never[]): unknown => {
        this.access.check(record, activation, token, optional ? "optional" : "require");
        this.access.available(binding, token);
        if (binding.activation.apis.get(key) !== entry) throw new LunarisError("PROVIDER_UNAVAILABLE", "API registration was disposed.", { contractId: token.id });
        this.access.authorize(binding.provider, entry.token, "provide");
        try {
          const result = this.access.invoke(() => method.apply(entry.implementation, args));
          if (result instanceof Promise) return result.catch(cause => {
            this.diagnostics.record("API_CALL_FAILED", { ...context(record, activation), contractId: token.id }, cause); throw cause;
          });
          return result;
        } catch (cause) {
          this.diagnostics.record("API_CALL_FAILED", { ...context(record, activation), contractId: token.id }, cause); throw cause;
        }
      };
    }
    return Object.freeze(handle) as T;
  }
}
