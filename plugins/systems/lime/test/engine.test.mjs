import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestKernel } from '@lunaris/test';
import { definePlugin } from '@lunaris/sdk';
import { Logger } from '@lunaris/logging';
import { Filesystem, filesystemMethods } from '@lunaris/filesystem';
import { Vault, VaultLifecycle } from '@lunaris/vault';
import { Lime, LimeRuntime, LimePackagePicker } from '@lunaris/lime';
import { packLup } from '@lunaris/lup';
import { createLime } from '@lunaris/lime-manager';

const ok = value => ({ ok: true, value });
const failure = code => ({ ok: false, error: { code, message: code } });
function packageBytes(version = '1.0.0', id = 'test.package') {
  const manifest = { manifestVersion: 1, id, version, engine: '^0.1.0', sdk: '^0.1.0', entry: './plugin.js', metadata: { name: 'Plugin', author: 'Author', description: 'A package', platforms: ['desktop'], languages: ['en'] }, provides: [], requires: [], permissions: [], optionalPermissions: [] };
  const encode = text => new TextEncoder().encode(text);
  return packLup([{ path: 'manifest.json', data: encode(JSON.stringify(manifest)) }, { path: 'plugin.js', data: encode(`throw Error('preview must not evaluate');`) }]);
}
async function fixture() {
  const kernel = createTestKernel(); const files = new Map(); const selected = []; const executions = []; const runtimes = new Map();
  let root = { id: 'vault-a', name: 'A' }; let participant; let api; let revision = 0; let failWrites = false; let failActivation = false;
  kernel.installMock(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(name => [name, () => true])));
  const methods = Object.fromEntries(filesystemMethods.map(name => [name, async () => failure('NOT_FOUND')]));
  const key = target => `${target.vaultId}:${target.path}`;
  methods.readText = async target => { const file = files.get(key(target)); return file ? ok({ text: new TextDecoder().decode(file.bytes), version: file.version }) : failure('NOT_FOUND'); };
  methods.readFile = async target => { const file = files.get(key(target)); return file ? ok({ data: Array.from(file.bytes), version: file.version }) : failure('NOT_FOUND'); };
  const write = async (target, bytes, options) => {
    if (failWrites) return failure('IO_ERROR'); const previous = files.get(key(target));
    if (options.mode === 'create' && previous) return failure('ALREADY_EXISTS');
    if (options.expectedVersion && previous?.version !== options.expectedVersion) return failure('CONFLICT');
    const version = String(++revision); files.set(key(target), { bytes, version }); return ok({ version });
  };
  methods.writeText = (target, text, options) => write(target, new TextEncoder().encode(text), options);
  methods.writeFile = (target, bytes, options) => write(target, new Uint8Array(bytes), options);
  methods.createDirectory = async () => ok(null); methods.capabilities = () => ({ atomicReplace: true, watch: false, maxFileBytes: 64 * 1024 * 1024, versionCheck: 'optimistic', trash: false });
  kernel.installMock(Filesystem, methods);
  kernel.installMock(Vault, { current: () => root, async open() { return ok(root); }, async close() { root = null; return ok(null); } });
  kernel.installMock(VaultLifecycle, { register(value) { participant = value; return ok(null); } });
  kernel.installMock(LimePackagePicker, { async pick(owner) { const value = selected.shift() ?? null; return ok(typeof value === 'function' ? await value(owner) : value); } });
  kernel.installMock(LimeRuntime, {
    async open() { runtimes.clear(); return ok(null); }, async close() { runtimes.clear(); return ok(null); }, snapshot() { return ok([...runtimes.values()]); },
    async register(env, manifest, source, enabled) { if (manifest.id === 'test.builtin') return failure('CONFLICT'); runtimes.set(manifest.id, { id: manifest.id, version: manifest.version, state: enabled ? 'active' : 'disabled' }); return ok(null); },
    async enable(env, id) { if (failActivation) { runtimes.get(id).state = 'failed'; return failure('RUNTIME_FAILED'); } executions.push(id); runtimes.get(id).state = 'active'; return ok(null); },
    async disable(env, id) { runtimes.get(id).state = 'disabled'; return ok(null); },
    async replace(env, manifest) { if (failActivation) return failure('RUNTIME_FAILED'); runtimes.get(manifest.id).version = manifest.version; return ok(null); },
    async remove(env, id) { runtimes.delete(id); return ok(null); },
  });
  const plugin = createLime({ platform: 'web' }); kernel.register(plugin);
  for (const permission of plugin.manifest.permissions) kernel.grant(plugin.manifest.id, permission);
  kernel.register(definePlugin({ manifest: { manifestVersion: 1, id: 'test.consumer', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides: [], requires: [{ kind: 'api', id: Lime.id, range: '^1.0.0' }], permissions: [], optionalPermissions: [] }, activate(ctx) { api = ctx.use(Lime); } }));
  await kernel.start('test.consumer'); await api.restore();
  return { kernel, files, selected, executions, runtimes, api, get participant() { return participant; }, setRoot: value => { root = value; }, setFailWrites: value => { failWrites = value; }, setFailActivation: value => { failActivation = value; } };
}

test('preview is inert and exact-byte confirmation persists only in the captured Vault', async () => {
  const f = await fixture(); f.selected.push(packageBytes()); const preview = await f.api.preview();
  assert.equal(preview.ok, true); assert.equal(preview.value.platformWarning, true); assert.deepEqual(f.executions, []); assert.equal(f.files.size, 0);
  assert.equal((await f.api.install(preview.value.ticket)).ok, true);
  assert.deepEqual(f.executions, ['test.package']); assert.equal(f.api.snapshot().installations[0].enabled, true);
  assert.equal(f.api.snapshot().installations[0].recoveryRequired, false);
  assert.ok([...f.files.keys()].every(key => key.startsWith('vault-a:.lunaris/plugins/')));
  assert.equal((await f.api.install(preview.value.ticket)).error.code, 'STALE');
  await f.kernel.stopAll(); f.kernel.assertNoResources();
});

test('cancel, builtin collision and failed package storage cannot install/activate code', async () => {
  const f = await fixture(); assert.deepEqual(await f.api.preview(), ok(null));
  f.selected.push(packageBytes('1.0.0', 'test.builtin')); const builtin = await f.api.preview();
  assert.equal((await f.api.install(builtin.value.ticket)).error.code, 'CONFLICT'); assert.equal(f.files.size, 0);
  f.selected.push(packageBytes()); const preview = await f.api.preview(); f.setFailWrites(true);
  assert.equal((await f.api.install(preview.value.ticket)).error.code, 'STORAGE_FAILED');
  assert.equal(f.runtimes.size, 0); assert.deepEqual(f.executions, []); assert.equal(f.api.snapshot().installations.length, 0);
  await f.kernel.stopAll();
});

test('failed activation preserves durable recovery intent and safe mode never executes packages', async () => {
  const f = await fixture(); f.setFailActivation(true); f.selected.push(packageBytes()); const preview = await f.api.preview();
  assert.equal((await f.api.install(preview.value.ticket)).error.code, 'RUNTIME_FAILED'); assert.equal(f.api.snapshot().installations[0].recoveryRequired, true);
  f.setFailActivation(false); await f.api.restore(); assert.deepEqual(f.executions, []);
  assert.equal((await f.api.retry('test.package')).ok, true); assert.deepEqual(f.executions, ['test.package']);
  await f.api.restore(true); assert.equal(f.api.snapshot().safeMode, true); assert.equal(f.executions.length, 1);
  assert.equal((await f.api.enable('test.package')).error.code, 'CONFLICT');
  await f.kernel.stopAll();
});

test('Vault lifecycle discards previews, separates environments and restores independent enabled state', async () => {
  const f = await fixture(); f.selected.push(packageBytes()); const preview = await f.api.preview();
  await f.participant.beforeRelease({ id: 'vault-a' }, { id: 'vault-b' }); f.setRoot({ id: 'vault-b', name: 'B' }); await f.participant.settled({ id: 'vault-a' }, { id: 'vault-b' });
  assert.equal((await f.api.install(preview.value.ticket)).error.code, 'STALE'); assert.equal(f.files.size, 0);
  f.selected.push(packageBytes('2.0.0')); const next = await f.api.preview(); await f.api.install(next.value.ticket, false);
  assert.equal(f.api.snapshot().installations[0].version, '2.0.0'); assert.equal(f.executions.length, 0);
  await f.participant.beforeRelease({ id: 'vault-b' }, { id: 'vault-a' }); f.setRoot({ id: 'vault-a', name: 'A' }); await f.participant.settled({ id: 'vault-b' }, { id: 'vault-a' });
  assert.equal(f.api.snapshot().installations.length, 0); await f.kernel.stopAll();
});
