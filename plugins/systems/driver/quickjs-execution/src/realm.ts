import { getQuickJS } from "quickjs-emscripten";
import type { QuickJSHandle } from "quickjs-emscripten";
import type { CancellationSignal } from "@lunaris/sdk";
import type { ExecutionCapability, ExecutionIdentity, ExecutionLimits, ExecutionRealm, ExecutionSource, ExecutionValue } from "@lunaris/execution";

const MAX_DATA_BYTES = 1024 * 1024;
const validModule = (name: string): boolean => name.length > 0 && name.length <= 240 &&
  !/[\\:%?#\s\u0000-\u001f\u007f]/.test(name) && name.split('/').every(part => part !== '' && part !== '.' && part !== '..');

function data(text: string): ExecutionValue {
  if (text.length > MAX_DATA_BYTES) throw new Error("Execution data exceeds the transfer limit.");
  const value: unknown = JSON.parse(text);
  const visit = (item: unknown, depth: number): void => {
    if (depth > 64) throw new Error("Execution data exceeds the nesting limit.");
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (Array.isArray(item)) { for (const child of item) visit(child, depth + 1); return; }
    if (typeof item === 'object' && item !== null && Object.getPrototypeOf(item) === Object.prototype) {
      for (const child of Object.values(item)) visit(child, depth + 1);
      return;
    }
    throw new Error("Only finite JSON data may cross the execution boundary.");
  };
  visit(value, 0);
  return value as ExecutionValue;
}

/** Host-side constructor; package code receives copied data and explicit calls only. */
export async function createRealm(identity: ExecutionIdentity, source: ExecutionSource, capabilities: readonly ExecutionCapability[], owner: CancellationSignal, driver: CancellationSignal, limits: ExecutionLimits = {}): Promise<ExecutionRealm> {
  if (owner.aborted || driver.aborted) throw new Error("Execution owner is closed.");
  if (!identity.pluginId || !identity.activationId || !identity.vaultId || !Number.isSafeInteger(identity.generation) || identity.generation < 1) throw new Error("Invalid execution identity.");
  const principal = Object.freeze({ ...identity });
  const modules = new Map(Object.entries(source.modules));
  if (!validModule(source.entry) || !modules.has(source.entry) || modules.size > 512 || [...modules].some(([name, code]) => !validModule(name) || typeof code !== 'string' || code.length > 16 * 1024 * 1024)) throw new Error("Invalid execution modules.");
  const operations = new Map<string, ExecutionCapability['invoke']>();
  for (const capability of capabilities) {
    if (!/^[a-z][a-z0-9.-]*$/.test(capability.name) || operations.has(capability.name) || typeof capability.invoke !== 'function') throw new Error("Invalid execution capability.");
    operations.set(capability.name, capability.invoke);
  }
  const memory = limits.memoryBytes ?? 32 * 1024 * 1024;
  const stack = limits.stackBytes ?? 256 * 1024;
  const turn = limits.turnMilliseconds ?? 100;
  if (![memory, stack, turn].every(value => Number.isSafeInteger(value) && value > 0) || memory > 128 * 1024 * 1024 || stack > 1024 * 1024 || turn > 1000) throw new Error("Invalid execution limits.");
  const wasm = await getQuickJS();
  if (owner.aborted || driver.aborted) throw new Error("Execution owner is closed.");
  const runtime = wasm.newRuntime();
  runtime.setMemoryLimit(memory); runtime.setMaxStackSize(stack);
  let deadline = 0; let closed = false; let running = 0; let closeRequested = false;
  runtime.setInterruptHandler(() => closed || owner.aborted || driver.aborted || Date.now() >= deadline);
  runtime.setModuleLoader(name => {
    const code = modules.get(name);
    if (code === undefined) throw new Error("Module is not in the validated package.");
    return code;
  }, (base, requested) => {
    if (requested.startsWith('./') || requested.startsWith('../')) {
      const parts = base.split('/').slice(0, -1);
      for (const part of requested.split('/')) {
        if (part === '.') continue;
        if (part === '..') { if (!parts.length) throw new Error("Module escapes package."); parts.pop(); }
        else parts.push(part);
      }
      const name = parts.join('/'); if (!validModule(name)) throw new Error("Invalid module path."); return name;
    }
    if (!validModule(requested)) throw new Error("External module imports are unavailable.");
    return requested;
  });
  const vm = runtime.newContext();
  let exports: QuickJSHandle | undefined;
  let encode: QuickJSHandle | undefined;
  let decode: QuickJSHandle | undefined;
  const close = (): void => {
    if (closed) return;
    if (running) { closeRequested = true; return; }
    closed = true; owner.removeEventListener('abort', close); driver.removeEventListener('abort', close);
    exports?.dispose(); encode?.dispose(); decode?.dispose(); operations.clear(); modules.clear();
    vm.dispose(); runtime.dispose();
  };
  const execute = <T>(work: () => T): T => {
    if (closed || closeRequested || owner.aborted || driver.aborted) throw new Error("Execution realm is closed.");
    if (running >= 32) throw new Error("Execution reentry limit exceeded.");
    if (!running) deadline = Date.now() + turn;
    running++;
    try { return work(); }
    finally { running--; if (!running && (closeRequested || owner.aborted || driver.aborted)) close(); }
  };
  owner.addEventListener('abort', close, { once: true }); driver.addEventListener('abort', close, { once: true });
  try {
    execute(() => {
      const call = vm.newFunction('call', (name, encoded) => {
        if (owner.aborted || driver.aborted || closed || closeRequested) return { error: vm.newError("Execution authority revoked.") };
        try {
          if (!name || !encoded || vm.typeof(name) !== 'string' || vm.typeof(encoded) !== 'string') throw new Error("Invalid capability call.");
          const operation = operations.get(vm.getString(name)); if (!operation) throw new Error("Unknown execution capability.");
          const args = data(vm.getString(encoded)); if (!Array.isArray(args)) throw new Error("Capability arguments must be an array.");
          const result = operation(principal, args);
          const text = JSON.stringify(result); data(text);
          return vm.newString(text);
        } catch {
          // Original provider errors are the host broker's diagnostic responsibility.
          return { error: vm.newError("Execution capability failed.") };
        }
      });
      vm.setProp(vm.global, '__lunarisCall', call); call.dispose();
      const bootstrap = vm.unwrapResult(vm.evalCode(`(() => {
        const parse = JSON.parse, stringify = JSON.stringify, invoke = globalThis.__lunarisCall;
        const proto = Object.getPrototypeOf, keys = Reflect.ownKeys, descriptor = Object.getOwnPropertyDescriptor;
        const objectPrototype = Object.prototype, arrayPrototype = Array.prototype, finite = Number.isFinite;
        const serialize = value => {
          const check = (item, depth) => {
            if (depth > 64) throw Error('Transfer nesting limit');
            if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
            if (typeof item === 'number' && finite(item)) return;
            if (typeof item !== 'object' || ![null, objectPrototype, arrayPrototype].includes(proto(item))) throw Error('Expected JSON data');
            for (const key of keys(item)) {
              if (typeof key !== 'string') throw Error('Expected JSON keys');
              const field = descriptor(item, key);
              if (!('value' in field)) throw Error('Accessors are not transfer data');
              check(field.value, depth + 1);
            }
          };
          check(value, 0); return stringify(value);
        };
        delete globalThis.__lunarisCall;
        globalThis.lunaris = Object.freeze({ call(name, ...args) { return parse(invoke(name, serialize(args))); } });
        return { encode: serialize, decode: parse };
      })()`));
      encode = vm.getProp(bootstrap, 'encode'); decode = vm.getProp(bootstrap, 'decode'); bootstrap.dispose();
      vm.unwrapResult(vm.evalCode(`import * as entry from ${JSON.stringify(source.entry)}; globalThis.__lunarisExports = entry;`, '__lunaris_bootstrap__.js', { type: 'module' })).dispose();
      exports = vm.getProp(vm.global, '__lunarisExports');
      if (vm.typeof(exports) !== 'object') throw new Error("Entry module did not finish synchronous evaluation.");
    });
    return Object.freeze({
      call(name: string, args: readonly ExecutionValue[]): ExecutionValue {
        return execute(() => {
          const json = JSON.stringify(args); data(json);
          const text = vm.newString(json);
          let input: QuickJSHandle;
          try { input = vm.unwrapResult(vm.callFunction(decode!, vm.undefined, text)); } finally { text.dispose(); }
          const fn = vm.getProp(exports!, name);
          const handles: QuickJSHandle[] = [];
          try {
            if (vm.typeof(fn) !== 'function') throw new Error("Entry export is not callable.");
            for (let i = 0; i < args.length; i++) handles.push(vm.getProp(input, i));
            const value = vm.unwrapResult(vm.callFunction(fn, vm.undefined, ...handles));
            try {
              const encoded = vm.unwrapResult(vm.callFunction(encode!, vm.undefined, value));
              try {
                const result = data(vm.getString(encoded));
                // Async callbacks resolve via explicit guest Promise wiring. Run only
                // at the outermost turn, under the same interruption deadline.
                if (running === 1) {
                  const jobs = runtime.executePendingJobs();
                  if (jobs.error) { const error = vm.dump(jobs.error); jobs.error.dispose(); throw new Error("Guest async task failed.", { cause: error }); }
                }
                return result;
              } finally { encoded.dispose(); }
            } finally { value.dispose(); }
          } finally { input.dispose(); fn.dispose(); for (const handle of handles) handle.dispose(); }
        });
      }, dispose: close,
    });
  } catch (error) { close(); throw error; }
}
