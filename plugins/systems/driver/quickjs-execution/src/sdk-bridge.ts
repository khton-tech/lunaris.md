import { definePlugin, LunarisError } from "@lunaris/sdk";
import type { ApiToken, CancellationSignal, PluginContext, PluginDefinition, PluginManifest } from "@lunaris/sdk";
import type { ExecutionLimits, ExecutionRealm, ExecutionSource, ExecutionValue } from "@lunaris/execution";
import { createRealm } from "./realm.js";
import { guestBridge } from "./guest-bridge.js";

type Wire = ExecutionValue;
type Fn = (...args: unknown[]) => unknown;
const record = (value: Wire): Record<string, Wire> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid bridge record.');
  return value as Record<string, Wire>;
};

class Bridge {
  #functions = new Map<number, Fn>();
  #next = 0;
  #closed = false;
  #reject = new Set<(reason: Error) => void>();
  #signals = new Map<number, CancellationSignal>();
  realm?: ExecutionRealm;

  dispose(): void {
    this.#closed = true;
    for (const reject of this.#reject) reject(new Error('SDK execution closed.'));
    this.#reject.clear(); this.#functions.clear(); this.#signals.clear();
  }

  #remember(fn: Fn): number {
    if (this.#closed) throw new Error('SDK execution closed.');
    if (this.#functions.size >= 8192) throw new Error('Host SDK handle limit exceeded.');
    const id = ++this.#next; this.#functions.set(id, fn); return id;
  }

  pack(value: unknown, depth = 0): Wire {
    if (depth > 32 || this.#closed) throw new Error('SDK transfer unavailable.');
    if (value === undefined) return { $: 'u' };
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'bigint') return { $: 'b', value: String(value) };
    if (typeof value === 'function') return { $: 'h', id: this.#remember(value as Fn) };
    if (value instanceof Promise) return { $: 'q', id: this.#remember((resolve, reject) => {
      void value.then(result => { if (!this.#closed) (resolve as Fn)(result); }, error => { if (!this.#closed) (reject as Fn)({ code: error instanceof LunarisError ? error.code : 'SDK_FAILED', message: 'SDK operation failed' }); }).catch(() => {});
    }) };
    if (value instanceof Date) return { $: 'd', value: value.toISOString() };
    if (Array.isArray(value)) return { $: 'a', value: value.map(item => this.pack(item, depth + 1)) };
    if (typeof value !== 'object') throw new Error('Unsupported SDK transfer.');
    const signal = value as Partial<CancellationSignal>;
    if (typeof signal.aborted === 'boolean' && typeof signal.addEventListener === 'function' && typeof signal.removeEventListener === 'function' && typeof signal.throwIfAborted === 'function') {
      const listeners = new Map<number, () => void>(); let sequence = 0;
      const source = signal as CancellationSignal;
      const ref = ++this.#next; this.#signals.set(ref, source);
      return { $: 's', ref, state: this.pack(() => [source.aborted, source.reason === undefined ? undefined : 'SDK scope closed']),
        add: this.pack((callback: Fn, options?: { once?: boolean }) => { const id = ++sequence; const listener = () => { callback(); if (options?.once) listeners.delete(id); }; listeners.set(id, listener); source.addEventListener('abort', listener, options); return id; }),
        remove: this.pack((id: number) => { const listener = listeners.get(id); if (listener) source.removeEventListener('abort', listener); listeners.delete(id); }),
      };
    }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error('Host objects require an explicit public adapter.');
    const entries: Wire[] = [];
    for (const key of Object.keys(value)) {
      const field = Object.getOwnPropertyDescriptor(value, key);
      if (!field || !('value' in field)) throw new Error('Host accessors require an explicit adapter.');
      const item = typeof field.value === 'function' ? (field.value as Fn).bind(value) : field.value;
      entries.push([key, this.pack(item, depth + 1)]);
    }
    return { $: 'o', value: entries };
  }

  unpack(value: Wire, depth = 0): unknown {
    if (depth > 32 || this.#closed) throw new Error('SDK transfer unavailable.');
    if (value === null || typeof value !== 'object') return value;
    const item = record(value);
    switch (item.$) {
      case 'r': if (typeof item.id === 'number' && this.#signals.has(item.id)) return this.#signals.get(item.id); break;
      case 'u': return undefined;
      case 'b': if (typeof item.value === 'string') return BigInt(item.value); break;
      case 'd': if (typeof item.value === 'string') return new Date(item.value); break;
      case 'a': if (Array.isArray(item.value)) return item.value.map(child => this.unpack(child, depth + 1)); break;
      case 'o': {
        if (!Array.isArray(item.value)) break;
        const result: Record<string, unknown> = {};
        for (const pair of item.value) {
          if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string') throw new Error('Invalid SDK field.');
          Object.defineProperty(result, pair[0], { enumerable: true, writable: true, configurable: true, value: this.unpack(pair[1]!, depth + 1) });
        }
        return result;
      }
      case 'g': case 'p': {
        if (typeof item.id !== 'number' || !Number.isSafeInteger(item.id)) break;
        const id = item.id;
        const invoke = (...args: unknown[]): unknown => {
          if (this.#closed || !this.realm) throw new Error('SDK execution closed.');
          const result = record(this.realm.call('__sdkCall', [id, this.pack(args)]));
          if (result.ok !== true) throw new Error('Plugin callback failed.', { cause: result.code });
          return this.unpack(result.value!);
        };
        if (item.$ === 'g') return invoke;
        return new Promise((resolve, reject) => {
          this.#reject.add(reject);
          const settled = (fn: (value: unknown) => void) => (result: unknown) => { this.#reject.delete(reject); fn(result); };
          try { invoke(settled(resolve), settled(reject)); } catch (error) { this.#reject.delete(reject); reject(error); }
        });
      }
    }
    throw new Error('Invalid SDK wire value.');
  }

  invoke = (_identity: unknown, args: readonly ExecutionValue[]): Wire => {
    try {
      const id = args[0]; const fn = typeof id === 'number' ? this.#functions.get(id) : undefined;
      if (!fn || this.#closed) throw new Error('Unknown SDK handle.');
      const values = this.unpack(args[1]!); if (!Array.isArray(values)) throw new Error('Invalid SDK arguments.');
      return { ok: true, value: this.pack(fn(...values)) };
    } catch (error) {
      return { ok: false, code: error instanceof LunarisError ? error.code : 'SDK_FAILED', message: 'SDK operation failed' };
    }
  };
}

/** Public provider gateways are narrowed by captured authority, never guest IDs. */
function scopedContext(ctx: PluginContext, vaultId: string): PluginContext {
  const deny = (): never => { throw new LunarisError('PERMISSION_DENIED', 'This operation is outside the captured Vault.'); };
  const allowed = (token: { readonly id: string; readonly providePermission?: string; readonly consumePermission?: string }): void => {
    if ([token.providePermission, token.consumePermission].some(permission => permission && ['runtime.manage', 'filesystem.native', 'filesystem.app-config', 'account.network'].includes(permission))) deny();
  };
  const bind = <T extends object>(token: ApiToken<T>, optional: boolean): T | undefined => {
    allowed(token);
    const api = optional ? ctx.optional(token) : ctx.use(token);
    if (!api) return undefined;
    const methods: Record<string, Fn> = {};
    for (const name of Object.keys(api)) {
      const method = (api as Record<string, unknown>)[name]; if (typeof method !== 'function') deny();
      methods[name] = (...args) => {
        const values = [...args];
        if (token.id === 'lunaris.config') {
          if (values[0] !== ctx.pluginId) deny();
          const position = name === 'read' ? 1 : name === 'get' ? 2 : name === 'set' ? 3 : 2;
          const options = values[position] as { scope?: string; vaultId?: string } | undefined;
          if (options?.scope === 'global' || (options?.vaultId !== undefined && options.vaultId !== vaultId)) deny();
          values[position] = { scope: 'vault', vaultId };
        }
        if (token.id === 'lunaris.filesystem' || token.id === 'lunaris.filesystem-observation') {
          if (['selectVault', 'closeVault'].includes(name)) deny();
          const inspect = (value: unknown): void => {
            if (value && typeof value === 'object' && 'vaultId' in value && (value as { vaultId: unknown }).vaultId !== vaultId) deny();
          };
          for (const value of values) inspect(value);
          if (['pickFile', 'pickDirectory', 'pickSaveLocation', 'unwatch'].includes(name) && values[0] !== vaultId) deny();
        }
        if (token.id === 'lunaris.logger') {
          if (name === 'log') values[0] = { ...(values[0] as object), source: ctx.pluginId };
          else values[0] = ctx.pluginId;
        }
        return (method as Fn).apply(api, values);
      };
    }
    return Object.freeze(methods) as T;
  };
  return Object.freeze({ ...ctx,
    provide<T extends object>(token: ApiToken<T>, implementation: T) { allowed(token); return ctx.provide(token, implementation); },
    use<T extends object>(token: ApiToken<T>): T { return bind(token, false)!; },
    optional<T extends object>(token: ApiToken<T>): T | undefined { return bind(token, true); },
  });
}

/** An isolated definition evaluates fresh code for each activation and cleans last. */
export function isolatedDefinition(manifest: PluginManifest, source: ExecutionSource, environment: { readonly vaultId: string; readonly generation: number }, owner: CancellationSignal, driver: CancellationSignal, limits?: ExecutionLimits): PluginDefinition {
  const captured = { entry: source.entry, modules: Object.freeze({ ...source.modules }) };
  const bound = Object.freeze({ ...environment });
  return definePlugin({ manifest, async activate(ctx) {
    const bridge = new Bridge();
    const entry = '__lunaris_sdk_entry__.js';
    if (Object.hasOwn(captured.modules, entry)) throw new Error('Reserved SDK module path.');
    const code = `import __entry from ${JSON.stringify(captured.entry)};\n${guestBridge}`;
    const realm = await createRealm({ pluginId: ctx.pluginId, activationId: ctx.activationId, ...bound }, { entry, modules: { ...captured.modules, [entry]: code } }, [{ name: 'sdk.call', invoke: bridge.invoke }], owner, driver, limits);
    bridge.realm = realm;
    let owned = false;
    try {
      ctx.scope.own({ dispose() { bridge.dispose(); realm.dispose(); } });
      owned = true;
      const actual = realm.call('__sdkManifest', []);
      const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
      if (canonical(actual) !== canonical(manifest)) throw new Error('Package entry manifest differs from inspected metadata.');
      return await bridge.unpack(realm.call('__sdkActivate', [bridge.pack(scopedContext(ctx, bound.vaultId))])) as Awaited<ReturnType<PluginDefinition['activate']>>;
    } catch (error) {
      // Once owned, kernel rollback must run guest disposers before this realm's
      // final disposer. Early VM destruction would turn safe rollback into failure.
      if (!owned) { bridge.dispose(); realm.dispose(); }
      throw error;
    }
  } });
}
