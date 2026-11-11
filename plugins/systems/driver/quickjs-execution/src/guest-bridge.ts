/** Interpreter-local codec. All references denote this realm's registered functions. */
export const guestBridge = `
const functions = new Map(); let next = 0;
const functionIds = new WeakMap();
const hostSignals = new WeakMap();
const hostFunctions = new Map(), hostFunctionCounts = new Map();
const hostFinalizer = new FinalizationRegistry(id => {
  const count = (hostFunctionCounts.get(id) ?? 1) - 1;
  if (count > 0) { hostFunctionCounts.set(id, count); return; }
  hostFunctionCounts.delete(id); hostFunctions.delete(id); lunaris.call('sdk.release', id);
});
const remember = fn => {
  let id = functionIds.get(fn);
  if (!id) { id = ++next; functionIds.set(fn, id); }
  if (!functions.has(id)) { if (functions.size >= 8192) throw Error('Guest handle limit'); functions.set(id, fn); }
  return id;
};
const encode = (value, depth = 0) => {
  if (depth > 32) throw Error('Bridge nesting limit');
  if (value && typeof value === 'object' && hostSignals.has(value)) return { $: 'r', id: hostSignals.get(value) };
  if (value === undefined) return { $: 'u' };
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'bigint') return { $: 'b', value: String(value) };
  if (typeof value === 'function') return { $: 'g', id: remember(value) };
  if (value instanceof Promise) return { $: 'p', id: remember((resolve, reject) => { void value.then(resolve, reject); }) };
  if (value instanceof Date) return { $: 'd', value: value.toISOString() };
  if (Array.isArray(value)) return { $: 'a', value: value.map(item => encode(item, depth + 1)) };
  const entries = [];
  for (const name of Object.keys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, name);
    if (!field || !('value' in field)) throw Error('Guest accessors cannot cross the SDK boundary');
    const item = typeof field.value === 'function' ? field.value.bind(value) : field.value;
    entries.push([name, encode(item, depth + 1)]);
  }
  return { $: 'o', value: entries };
};
const operation = (id, args) => {
  const result = lunaris.call('sdk.call', id, encode(args));
  if (!result.ok) { const error = Error(result.message); error.code = result.code; throw error; }
  return decode(result.value);
};
const decode = (value, depth = 0) => {
  if (depth > 32) throw Error('Bridge nesting limit');
  if (value === null || typeof value !== 'object') return value;
  if (value.$ === 'u') return undefined;
  if (value.$ === 'b') return BigInt(value.value);
  if (value.$ === 'd') return new Date(value.value);
  if (value.$ === 'h') {
    let fn = hostFunctions.get(value.id)?.deref();
    if (!fn) { fn = (...args) => operation(value.id, args); hostFunctions.set(value.id, new WeakRef(fn)); hostFunctionCounts.set(value.id, (hostFunctionCounts.get(value.id) ?? 0) + 1); hostFinalizer.register(fn, value.id); }
    return fn;
  }
  if (value.$ === 'q') return new Promise((resolve, reject) => { try { operation(value.id, [resolve, reject]); } finally { lunaris.call('sdk.release', value.id); } });
  if (value.$ === 's') {
    const state = decode(value.state, depth + 1), add = decode(value.add, depth + 1), remove = decode(value.remove, depth + 1);
    const listeners = new Map();
    const signal = { get aborted() { return state()[0]; }, get reason() { return state()[1]; },
      throwIfAborted() { if (state()[0]) throw Error('SDK scope closed'); },
      addEventListener(type, listener, options) {
        if (type !== 'abort' || listeners.has(listener)) return;
        const id = add(() => listener(), options); listeners.set(listener, id);
      },
      removeEventListener(type, listener) { if (type === 'abort' && listeners.has(listener)) { remove(listeners.get(listener)); listeners.delete(listener); } }
    }; hostSignals.set(signal, value.ref); return signal;
  }
  if (value.$ === 'a') return value.value.map(item => decode(item, depth + 1));
  if (value.$ === 'o') return Object.fromEntries(value.value.map(([key, item]) => [key, decode(item, depth + 1)]));
  throw Error('Invalid host bridge value');
};
export function __sdkCall(id, args) {
  try { const fn = functions.get(id); if (!fn) throw Error('Unknown guest function'); return { ok: true, value: encode(fn(...decode(args))) }; }
  catch (error) {
    const field = (name, fallback, limit) => {
      try { const value = error && typeof error === 'object' ? Object.getOwnPropertyDescriptor(error, name)?.value : undefined; return typeof value === 'string' ? value.slice(0,limit) : fallback; } catch { return fallback; }
    };
    return { ok: false, code: field('code','GUEST_FAILED',120), name: field('name','Error',120), message: field('message',typeof error === 'string' ? error.slice(0,8192) : 'Plugin callback failed',8192), stack: field('stack','',32768) };
  }
}
export function __sdkManifest() { return __entry.manifest; }
export function __sdkActivate(context) { return encode(__entry.activate(decode(context))); }
export function __sdkRelease(ids) { for (const id of ids) functions.delete(id); return null; }
`;
