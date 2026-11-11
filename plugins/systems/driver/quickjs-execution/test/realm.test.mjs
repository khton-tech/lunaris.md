import test from 'node:test';
import assert from 'node:assert/strict';
import execution from '@lunaris/quickjs-execution';
import { PluginExecution } from '@lunaris/execution';
import { definePlugin, defineApi } from '@lunaris/sdk';
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
  return { kernel, owner, identity,
    load: (manifest, code) => api.load(manifest, { entry: 'plugin.js', modules: { 'plugin.js': code } }, { vaultId: identity.vaultId, generation: identity.generation }, owner.signal),
    create: (code, capabilities = [], modules = {}, limits) => api.create(identity, { entry: 'plugin.js', modules: { 'plugin.js': code, ...modules } }, capabilities, owner.signal, limits) };
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

test('isolated definitions use real SDK APIs with validators, async calls, callbacks and cleanup', async () => {
  const f = await fixture();
  const Service = defineApi({ id: 'test.service', version: '1.0.0' });
  const Guest = defineApi({ id: 'test.guest', version: '1.0.0' }); let service; const values = [];
  f.kernel.installMock(Service, { value() { return 4; }, async later(value) { return value + 1; }, visit(callback) { return callback(10); } });
  const manifest = { manifestVersion: 1, id: 'test.package', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './plugin.js', provides: [{ kind: 'api', id: Guest.id, version: '1.0.0' }], requires: [{ kind: 'api', id: Service.id, range: '^1.0.0' }], permissions: [], optionalPermissions: [] };
  const code = `export default { manifest: ${JSON.stringify(manifest)}, async activate(ctx) {
    const api = ctx.use({ kind: 'api', id: 'test.service', version: '1.0.0' });
    const value = await api.later(api.value());
    ctx.scope.own({ dispose() {} });
    ctx.provide({ kind: 'api', id: 'test.guest', version: '1.0.0', validate: value => typeof value.read === 'function' }, {
      read() { return value; }, async later() { return await api.later(20); },
      callback() { return api.visit(value => value * 2); },
      globals() { return [typeof process, typeof window, typeof document]; }
    });
  } };`;
  const definition = f.load(manifest, code); f.kernel.register(definition, { ownerId: execution.manifest.id });
  f.kernel.register(definePlugin({ manifest: { ...manifest, id: 'test.consumer', provides: [], requires: [{ kind: 'api', id: Guest.id, range: '^1.0.0' }] }, activate(ctx) { service = ctx.use(Guest); values.push(service.read()); } }));
  await f.kernel.start('test.consumer');
  assert.deepEqual(values, [5]); assert.equal(await service.later(), 21); assert.equal(service.callback(), 20);
  assert.deepEqual(service.globals(), ['undefined', 'undefined', 'undefined']);
  await f.kernel.restart('test.package');
  await f.kernel.start('test.consumer'); assert.deepEqual(values, [5, 5]);
  await f.kernel.stopAll(); f.kernel.assertNoResources();
});

test('isolated loader rejects manifest drift before activation side effects', async () => {
  const f = await fixture();
  const manifest = { manifestVersion: 1, id: 'test.package', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './plugin.js', provides: [], requires: [], permissions: [], optionalPermissions: [] };
  f.kernel.register(f.load(manifest, `export default { manifest: ${JSON.stringify({ ...manifest, version: '9.0.0' })}, activate() { throw Error('must not activate'); } };`), { ownerId: execution.manifest.id });
  await assert.rejects(f.kernel.start('test.package'), { code: 'ACTIVATION_FAILED' });
  await f.kernel.stopAll(); f.kernel.assertNoResources();
});

test('failed activation keeps its realm alive until owned guest resources finish cleanup', async () => {
  const f = await fixture();
  const manifest = { manifestVersion: 1, id: 'test.package', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './plugin.js', provides: [], requires: [], permissions: [], optionalPermissions: [] };
  f.kernel.register(f.load(manifest, `export default { manifest: ${JSON.stringify(manifest)}, activate(ctx) { ctx.scope.own({ dispose() {} }); throw Error('activation failed'); } };`), { ownerId: execution.manifest.id });
  await assert.rejects(f.kernel.start('test.package'), { code: 'ACTIVATION_FAILED' });
  assert.equal(f.kernel.diagnostics().some(item => item.code === 'CLEANUP_FAILED'), false);
  await f.kernel.stopAll(); f.kernel.assertNoResources();
});

test('SDK broker binds Config and Filesystem calls to captured identity and rejects global/native access', async () => {
  const f = await fixture(); const calls = [];
  const Config = defineApi({ id: 'lunaris.config', version: '1.0.0', consumePermission: 'config.access' });
  const Filesystem = defineApi({ id: 'lunaris.filesystem', version: '1.0.0', consumePermission: 'filesystem.access' });
  const Guest = defineApi({ id: 'test.guest', version: '1.0.0' }); let guest;
  f.kernel.installMock(Config, { get(id, key, options) { calls.push(['config', id, options]); return { ok: true, value: 1 }; } });
  f.kernel.installMock(Filesystem, { readText(target) { calls.push(['fs', target]); return { ok: true, value: { text: 'value' } }; } });
  const manifest = { manifestVersion: 1, id: 'test.package', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './plugin.js', provides: [{ kind: 'api', id: Guest.id, version: '1.0.0' }], requires: [{ kind: 'api', id: Config.id, range: '^1.0.0' }, { kind: 'api', id: Filesystem.id, range: '^1.0.0' }], permissions: ['config.access', 'filesystem.access'], optionalPermissions: [] };
  const code = `export default { manifest: ${JSON.stringify(manifest)}, activate(ctx) {
    const config = ctx.use({ kind: 'api', id: 'lunaris.config', version: '1.0.0', consumePermission: 'config.access' });
    const fs = ctx.use({ kind: 'api', id: 'lunaris.filesystem', version: '1.0.0', consumePermission: 'filesystem.access' });
    ctx.provide({ kind: 'api', id: 'test.guest', version: '1.0.0' }, { config(scope) { return config.get(ctx.pluginId, 'key', scope); }, file(id) { return fs.readText({ vaultId: id, path: 'file.txt' }); } });
  } };`;
  f.kernel.register(f.load(manifest, code), { ownerId: execution.manifest.id });
  f.kernel.grant('test.package', 'config.access'); f.kernel.grant('test.package', 'filesystem.access');
  f.kernel.register(definePlugin({ manifest: { ...manifest, id: 'test.reader', provides: [], requires: [{ kind: 'api', id: Guest.id, range: '^1.0.0' }], permissions: [] }, activate(ctx) { guest = ctx.use(Guest); } }));
  await f.kernel.start('test.reader');
  assert.deepEqual(guest.config(), { ok: true, value: 1 });
  assert.deepEqual(calls[0], ['config', 'test.package', { scope: 'vault', vaultId: 'vault-a' }]);
  assert.throws(() => guest.config({ scope: 'global' })); assert.throws(() => guest.file('foreign-vault'));
  assert.equal(calls.length, 1); assert.equal(guest.file('vault-a').ok, true);
  await f.kernel.stopAll(); f.kernel.assertNoResources();
});

test('isolated SDK cannot acquire ambient roots/accounts or trigger a Vault transition', async () => {
  const f = await fixture(); let transitions = 0;
  const Vault = defineApi({ id: 'lunaris.vault', version: '1.0.0', consumePermission: 'vault.access' });
  f.kernel.installMock(Vault, { current() { return { id: 'vault-a', name: 'A' }; }, open() { transitions++; }, close() { transitions++; } });
  const blocked = [
    ['lunaris.filesystem-locations', 'filesystem.access'], ['lunaris.filesystem-roots', 'filesystem.access'],
    ['lunaris.directory-locations', 'filesystem.access'], ['lunaris.vault-locations', 'vault.access'],
    ['lunaris.vault-creation', 'vault.access'], ['lunaris.vault-history', 'vault.access'],
    ['lunaris.account-vaults', 'account.access'], ['lunaris.account-session', 'account.access'],
    ['lunaris.drafts', 'drafts.access'], ['test.native', 'example.native'],
  ].map(([id, consumePermission]) => ({ kind: 'api', id, version: '1.0.0', consumePermission }));
  const manifest = { manifestVersion: 1, id: 'test.package', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './plugin.js', provides: [], requires: [{ kind: 'api', id: Vault.id, range: '^1.0.0' }], permissions: ['vault.access'], optionalPermissions: [] };
  const code = `export default {manifest:${JSON.stringify(manifest)},activate(ctx){
    const denied = work => { let code; try { work(); } catch(error) { code = error.code; } if(code!=='PERMISSION_DENIED') throw Error('ambient authority admitted: '+code); };
    for(const token of ${JSON.stringify(blocked)}) { denied(()=>ctx.optional(token)); denied(()=>ctx.provide(token,{})); }
    denied(()=>ctx.events.on({kind:'event',id:'lunaris.account-session-changed',version:'1.0.0',consumePermission:'account.access'},()=>{}));
    denied(()=>ctx.hooks.register({kind:'hook',id:'lunaris.prepare-vault',version:'1.1.0',consumePermission:'vault.access'},value=>value));
    const vault = ctx.use(${JSON.stringify(Vault)}); if(vault.current().id!=='vault-a') throw Error('lost captured Vault');
    denied(()=>vault.open()); denied(()=>vault.close());
  }};`;
  f.kernel.register(f.load(manifest, code), { ownerId: execution.manifest.id }); f.kernel.grant('test.package', 'vault.access');
  await f.kernel.start('test.package'); assert.equal(transitions, 0); await f.kernel.stopAll(); f.kernel.assertNoResources();
});
