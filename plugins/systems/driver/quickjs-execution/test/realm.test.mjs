import test from 'node:test';
import assert from 'node:assert/strict';
import execution from '@lunaris/quickjs-execution';
import { PluginExecution } from '@lunaris/execution';
import { definePlugin } from '@lunaris/sdk';
import { Logger } from '@lunaris/logging';
import { createTestKernel } from '@lunaris/test';

async function fixture() {
  const kernel = createTestKernel(); let api;
  kernel.installMock(Logger, { log() { return true; }, debug() { return true; }, info() { return true; }, warn() { return true; }, error() { return true; } });
  kernel.register(execution);
  kernel.register(definePlugin({ manifest: { manifestVersion: 1, id: 'test.manager', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides: [], requires: [{ kind: 'api', id: PluginExecution.id, range: '^1.0.0' }], permissions: ['runtime.manage'], optionalPermissions: [] }, activate(ctx) { api = ctx.use(PluginExecution); } }));
  kernel.grant('test.manager', 'runtime.manage'); await kernel.start('test.manager');
  const owner = new AbortController();
  const identity = { pluginId: 'test.package', activationId: 'activation-1', vaultId: 'vault-a', generation: 1 };
  return { kernel, owner, identity, create: (code, capabilities = [], modules = {}, limits) => api.create(identity, { entry: 'plugin.js', modules: { 'plugin.js': code, ...modules } }, capabilities, owner.signal, limits) };
}

test('actual WASM realm preserves synchronous data calls without ambient host authority', async () => {
  const f = await fixture(); const seen = [];
  const realm = await f.create(`export function read(value) { return { value: lunaris.call('example.double', value), globals: [typeof window, typeof document, typeof process, typeof require, typeof fetch, typeof __TAURI_INTERNALS__], constructorGlobals: Function('return typeof process')() }; }`, [{ name: 'example.double', invoke(principal, args) { seen.push(principal); return args[0] * 2; } }]);
  f.identity.vaultId = 'changed';
  assert.deepEqual(realm.call('read', [4]), { value: 8, globals: Array(6).fill('undefined'), constructorGlobals: 'undefined' });
  assert.equal(seen[0].vaultId, 'vault-a'); assert.ok(Object.isFrozen(seen[0]));
  realm.dispose(); realm.dispose(); assert.throws(() => realm.call('read', [1]), /closed/);
  await f.kernel.stopAll(); f.kernel.assertNoResources();
});

test('package-relative modules work and outside, native, Node and remote imports fail', async () => {
  const f = await fixture();
  const realm = await f.create(`import { value } from './lib/value.js'; export function read() { return value; }`, [], { 'lib/value.js': 'export const value = 12;' });
  assert.equal(realm.call('read', []), 12); realm.dispose();
  for (const name of ['node:fs', '@tauri-apps/api/core', 'https://example.com/a.js', '../outside.js']) {
    await assert.rejects(f.create(`import x from ${JSON.stringify(name)}; export function read() { return x; }`));
  }
  await f.kernel.stopAll();
});

test('guest infinite loops are interrupted and fresh realms still work', async () => {
  const f = await fixture();
  await assert.rejects(f.create('while (true) {}', [], {}, { turnMilliseconds: 10 }));
  const realm = await f.create('export function spin() { while (true) {} } export function read() { return 7; }', [], {}, { turnMilliseconds: 10 });
  assert.throws(() => realm.call('spin', []));
  assert.equal(realm.call('read', []), 7); realm.dispose(); await f.kernel.stopAll();
});

test('owner and driver closure revoke realms and unselected capabilities are unavailable', async () => {
  const f = await fixture(); let calls = 0;
  const realm = await f.create(`export function call() { return lunaris.call('example.only'); } export function forbidden() { return lunaris.call('filesystem.open-config'); }`, [{ name: 'example.only', invoke() { calls++; return null; } }]);
  assert.throws(() => realm.call('forbidden', [])); assert.equal(calls, 0);
  f.owner.abort(); assert.throws(() => realm.call('call', []), /closed/); assert.equal(calls, 0);
  await f.kernel.stopAll();
  const g = await fixture(); const second = await g.create('export function read() { return 1; }');
  await g.kernel.stopAll(); assert.throws(() => second.call('read', []), /closed/);
});

test('non-data results, invalid limits and excessive transfer data fail explicitly', async () => {
  const f = await fixture();
  await assert.rejects(f.create('', [], {}, { memoryBytes: -1 }));
  const realm = await f.create('export function read(kind) { return kind === 1 ? Promise.resolve(1) : kind === 2 ? undefined : { get unsafe() { throw Error("getter"); } }; }');
  for (const kind of [1, 2, 3]) assert.throws(() => realm.call('read', [kind]));
  assert.throws(() => realm.call('read', ['x'.repeat(1024 * 1024 + 1)]), /limit/);
  realm.dispose(); await f.kernel.stopAll();
});
