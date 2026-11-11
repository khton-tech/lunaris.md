import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestKernel } from '@lunaris/test';
import { definePlugin } from '@lunaris/sdk';
import { Logger } from '@lunaris/logging';
import { Filesystem, filesystemMethods } from '@lunaris/filesystem';
import { Config, ConfigSnapshots } from '@lunaris/config';
import { Vault, VaultLifecycle } from '@lunaris/vault';
import { Lime, LimeRuntime, LimePackagePicker, LimeBootPolicy } from '@lunaris/lime';
import { packLup } from '@lunaris/lup';
import { createLime } from '@lunaris/lime-manager';

const ok = value => ({ ok: true, value });
const failure = code => ({ ok: false, error: { code, message: code } });
function packageBytes(version = '1.0.0', id = 'test.package') {
  const manifest = { manifestVersion: 1, id, version, engine: '^0.1.0', sdk: '^0.1.0', entry: './plugin.js', metadata: { name: 'Plugin', author: 'Author', description: 'A package', platforms: ['desktop'], languages: ['en'] }, provides: [], requires: [], permissions: [], optionalPermissions: [] };
  const encode = text => new TextEncoder().encode(text);
  return packLup([{ path: 'manifest.json', data: encode(JSON.stringify(manifest)) }, { path: 'plugin.js', data: encode(`throw Error('preview must not evaluate');`) }, { path: 'assets/example.json', data: encode('{"message":"Hello"}') }]);
}
async function fixture(options = {}) {
  const kernel = createTestKernel(); const files = new Map(); const directories = new Set(); const selected = []; const executions = []; const runtimes = new Map(); const settings = new Map(); const configCalls = []; const sources = []; const plans = new Map(); const providerSelections = []; const checkpoints = new Map(); const updateLifecycle = []; let nextCheckpoint = 0;
  let root = { id: 'vault-a', name: 'A' }; let participant; let api; let revision = 0; let failWrites = false; let failActivation = false; let failConfig = false;
  kernel.installMock(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(name => [name, () => true])));
  if (options.bootSafeMode) kernel.installMock(LimeBootPolicy, { safeMode: () => true });
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
  methods.createDirectory = async (target, recursive) => { if (!recursive && directories.has(key(target))) return failure('ALREADY_EXISTS'); directories.add(key(target)); return ok(null); };
  methods.stat = async target => files.has(key(target)) || directories.has(key(target)) ? ok({ path: target.path, kind: directories.has(key(target)) ? 'directory' : 'file', size: files.get(key(target))?.bytes.length ?? 0, modifiedAt: null }) : failure('NOT_FOUND');
  methods.list = async target => ok([...new Set([...files.keys(), ...directories])].filter(name => name.startsWith(key(target) + '/') && !name.slice(key(target).length + 1).includes('/')).map(name => ({ path: name.slice(target.vaultId.length + 1), kind: directories.has(name) ? 'directory' : 'file', size: files.get(name)?.bytes.length ?? 0, modifiedAt: null })));
  methods.capabilities = () => ({ atomicReplace: true, watch: false, maxFileBytes: 64 * 1024 * 1024, versionCheck: 'optimistic', trash: false });
  methods.remove = async target => { for (const name of [...files.keys()]) if (name === key(target) || name.startsWith(`${key(target)}/`)) files.delete(name); for (const name of [...directories]) if (name === key(target) || name.startsWith(`${key(target)}/`)) directories.delete(name); return ok(null); };
  kernel.installMock(Filesystem, methods);
  kernel.installMock(Config, {
    async read(id, target) { configCalls.push([id, target]); return failConfig ? failure('IO_ERROR') : ok(settings.get(id) ?? {}); },
    async get() { return ok(undefined); }, async set() { return ok(true); },
    async remove(id, key) { const table = settings.get(id); if (table) delete table[key]; return ok(true); },
  });
  kernel.installMock(ConfigSnapshots, {
    async capture(id) { return failConfig ? failure('IO_ERROR') : ok(JSON.stringify(settings.get(id) ?? {})); },
    async restore(id, text) { if (failConfig) return failure('IO_ERROR'); updateLifecycle.push('restore-data'); settings.set(id, JSON.parse(text)); return ok(null); },
  });
  kernel.installMock(Vault, { current: () => root, async open() { return ok(root); }, async close() { root = null; return ok(null); } });
  kernel.installMock(VaultLifecycle, { register(value) { participant = value; return ok(null); } });
  kernel.installMock(LimePackagePicker, { async pick(owner) { const value = selected.shift() ?? null; return ok(typeof value === 'function' ? await value(owner) : value); } });
  kernel.installMock(LimeRuntime, {
    async suspend(env, id) { const entry = { ...runtimes.get(id) }; checkpoints.set(++nextCheckpoint, entry); if (entry.state === 'active') runtimes.get(id).state = 'stopped'; updateLifecycle.push('suspend'); return ok(nextCheckpoint); },
    async resume(env, checkpoint, startTarget) { const saved = checkpoints.get(checkpoint); const current = runtimes.get(saved.id); updateLifecycle.push(`resume:${current.version}`); const result = await options.onResume?.({ current, settings, files, directories, failWrites: value => { failWrites = value; }, failConfig: value => { failConfig = value; } }); if (result) return result; if (saved.state === 'active' || startTarget) current.state = 'active'; return ok(null); },
    async rollback(env, checkpoint) { const saved = checkpoints.get(checkpoint); runtimes.set(saved.id, { ...saved, state: saved.state === 'disabled' ? 'disabled' : 'stopped' }); updateLifecycle.push('rollback'); return ok(null); },
    async finish(env, checkpoint) { checkpoints.delete(checkpoint); updateLifecycle.push('finish'); return ok(null); },
    plan(env, id) { return plans.has(id) ? ok(plans.get(id)) : failure('NOT_FOUND'); },
    async selectProvider(env, ...args) { providerSelections.push(args); return failActivation ? failure('RUNTIME_FAILED') : ok(null); },
    async open() { runtimes.clear(); checkpoints.clear(); return ok(null); }, async close() { runtimes.clear(); checkpoints.clear(); return ok(null); }, snapshot() { return ok([...runtimes.values()]); },
    async register(env, manifest, source, enabled) { if (manifest.id === 'test.builtin') return failure('CONFLICT'); sources.push(source); runtimes.set(manifest.id, { id: manifest.id, version: manifest.version, state: enabled ? 'active' : 'disabled' }); return ok(null); },
    async enable(env, id) { if (failActivation) { runtimes.get(id).state = 'failed'; return failure('RUNTIME_FAILED'); } executions.push(id); runtimes.get(id).state = 'active'; return ok(null); },
    async disable(env, id) { runtimes.get(id).state = 'disabled'; return ok(null); },
    async replace(env, manifest) { updateLifecycle.push('replace'); if (failActivation) return failure('RUNTIME_FAILED'); runtimes.get(manifest.id).version = manifest.version; return ok(null); },
    async remove(env, id) { runtimes.delete(id); return ok(null); },
  });
  const plugin = createLime({ platform: 'web' }); kernel.register(plugin);
  for (const permission of plugin.manifest.permissions) kernel.grant(plugin.manifest.id, permission);
  kernel.register(definePlugin({ manifest: { manifestVersion: 1, id: 'test.consumer', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides: [], requires: [{ kind: 'api', id: Lime.id, range: '^1.0.0' }], permissions: ['runtime.manage'], optionalPermissions: [] }, activate(ctx) { api = ctx.use(Lime); } }));
  kernel.grant('test.consumer', 'runtime.manage');
  await kernel.start('test.consumer'); await api.restore();
  return { kernel, files, directories, selected, executions, runtimes, settings, configCalls, sources, plans, providerSelections, updateLifecycle, api, get participant() { return participant; }, setRoot: value => { root = value; }, setFailWrites: value => { failWrites = value; }, setFailActivation: value => { failActivation = value; }, setFailConfig: value => { failConfig = value; } };
}

test('preview is inert and exact-byte confirmation persists only in the captured Vault', async () => {
  const f = await fixture(); f.selected.push(packageBytes()); const preview = await f.api.preview();
  assert.equal(preview.ok, true); assert.equal(preview.value.platformWarning, true); assert.deepEqual(f.executions, []); assert.equal(f.files.size, 0);
  assert.equal((await f.api.install(preview.value.ticket)).ok, true);
  assert.deepEqual(f.executions, ['test.package']); assert.equal(f.api.snapshot().installations[0].enabled, true);
  assert.equal(f.api.snapshot().installations[0].recoveryRequired, false);
  assert.deepEqual(f.sources[0].resources, { 'assets/example.json': [...new TextEncoder().encode('{"message":"Hello"}')] });
  assert.equal(f.sources[0].resources['manifest.json'], undefined);
  assert.ok([...f.files.keys()].every(key => key.startsWith('vault-a:.lunaris/plugins/')));
  assert.equal((await f.api.install(preview.value.ticket)).error.code, 'STALE');
  await f.kernel.stopAll(); f.kernel.assertNoResources();
});

test('install confirmation rejects a dependency graph that changed after preview', async () => {
  const f = await fixture();
  const plan = { pluginId: 'test.package', revision: 1, affected: ['test.package'], dependencies: [], graph: [] };
  f.plans.set('test.package', plan);
  f.selected.push(packageBytes());
  const preview = (await f.api.preview()).value;
  assert.equal(preview.dependencyPlan.revision, 1);
  f.plans.set('test.package', { ...plan, revision: 2 });
  assert.equal((await f.api.install(preview.ticket)).error.code, 'STALE');
  assert.equal(f.files.size, 0);
  assert.deepEqual(f.executions, []);
  await f.kernel.stopAll();
});

test('provider choices persist only through revision-checked plans and restore before startup', async () => {
  const f = await fixture(); f.selected.push(packageBytes()); await f.api.install((await f.api.preview()).value.ticket);
  f.plans.set('test.package', { pluginId: 'test.package', revision: 7, affected: ['test.package'], dependencies: [{ kind: 'api', id: 'test.value', range: '^1.0.0', optional: false, candidates: [{ id: 'test.first', version: '1.0.0', state: 'active' }, { id: 'test.second', version: '1.0.0', state: 'active' }] }] });
  const registry = () => JSON.parse(new TextDecoder().decode(f.files.get('vault-a:.lunaris/plugins/registry.json').bytes));
  const before = registry();
  assert.equal((await f.api.selectProvider('test.package', 'api', 'test.value', 'test.first', 6)).error.code, 'STALE');
  assert.deepEqual(registry(), before); assert.deepEqual(f.providerSelections, []);
  assert.equal((await f.api.selectProvider('test.package', 'api', 'test.value', 'test.first', 7)).ok, true);
  assert.deepEqual(registry().plugins[0].selections, [{ kind: 'api', contractId: 'test.value', providerId: 'test.first' }]);
  assert.equal(registry().plugins[0].recoveryRequired, false);
  f.providerSelections.length = 0; await f.api.restore();
  assert.deepEqual(f.providerSelections, [['test.package','api','test.value','test.first',7]]);
  f.setFailActivation(true);
  assert.equal((await f.api.selectProvider('test.package', 'api', 'test.value', 'test.second', 7)).error.code, 'RUNTIME_FAILED');
  assert.equal(registry().plugins[0].selections[0].providerId, 'test.first'); assert.equal(registry().plugins[0].recoveryRequired, true);
  await f.kernel.stopAll();
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

test('remove retains or deletes only managed Vault data/settings according to the persisted choice', async () => {
  const f = await fixture(); f.selected.push(packageBytes()); const preview = await f.api.preview(); await f.api.install(preview.value.ticket, false);
  const dataKey = 'vault-a:.lunaris/plugins/data/test.package/value.json';
  f.files.set(dataKey, { bytes: new TextEncoder().encode('data'), version: 'data' }); f.settings.set('test.package', { zoom: 2 });
  assert.equal((await f.api.remove('test.package', false)).ok, true); assert.equal(f.api.snapshot().installations.length, 0);
  assert.equal(f.files.has(dataKey), true); assert.deepEqual(f.settings.get('test.package'), { zoom: 2 });
  f.selected.push(packageBytes('2.0.0')); const next = await f.api.preview(); await f.api.install(next.value.ticket, false);
  assert.equal((await f.api.remove('test.package', true)).ok, true);
  assert.equal(f.files.has(dataKey), false); assert.deepEqual(f.settings.get('test.package'), {});
  assert.deepEqual(f.configCalls.at(-1), ['test.package', { scope: 'vault', vaultId: 'vault-a' }]);
  await f.kernel.stopAll();
});

test('failed removal persists a non-executable cleanup journal and restore retries it idempotently', async () => {
  const f = await fixture(); f.selected.push(packageBytes()); const preview = await f.api.preview(); await f.api.install(preview.value.ticket, false);
  f.setFailConfig(true); assert.equal((await f.api.remove('test.package', true)).error.code, 'STORAGE_FAILED');
  assert.equal(f.api.snapshot().installations[0].removalPending, true);
  assert.equal((await f.api.enable('test.package')).error.code, 'CONFLICT');
  assert.equal((await f.api.disable('test.package')).error.code, 'CONFLICT');
  f.setFailConfig(false); assert.equal((await f.api.restore()).ok, true);
  assert.equal(f.api.snapshot().installations.length, 0); assert.deepEqual(f.executions, []);
  await f.kernel.stopAll();
});

test('explicit updates commit new identity and failed replacements retain recovery intent', async () => {
  const f = await fixture(); f.selected.push(packageBytes()); const first = await f.api.preview(); await f.api.install(first.value.ticket, false);
  f.selected.push(packageBytes('2.0.0')); const next = await f.api.preview(); assert.equal((await f.api.update(next.value.ticket)).ok, true);
  assert.equal(f.api.snapshot().installations[0].version, '2.0.0'); assert.deepEqual(f.executions, []);
  f.selected.push(packageBytes('3.0.0')); const failed = await f.api.preview(); f.setFailActivation(true);
  assert.equal((await f.api.update(failed.value.ticket)).error.code, 'RUNTIME_FAILED');
  assert.equal(f.api.snapshot().installations[0].version, '2.0.0'); assert.equal(f.api.snapshot().installations[0].recoveryRequired, true);
  await f.kernel.stopAll();
});

test('failed candidate activation restores managed data/settings before old code resumes', async () => {
  const data = 'vault-a:.lunaris/plugins/data/test.package';
  const f = await fixture({ onResume({ current, settings, files }) {
    if (current.version === '2.0.0') { files.set(`${data}/value`, { bytes: new Uint8Array([9]), version: 'candidate' }); files.set(`${data}/new`, { bytes: new Uint8Array([8]), version: 'candidate' }); settings.set('test.package', { migrated: true }); return failure('RUNTIME_FAILED'); }
    assert.deepEqual(settings.get('test.package'), { original: true }); assert.deepEqual([...files.get(`${data}/value`).bytes], [1,2]);
  } });
  f.selected.push(packageBytes()); await f.api.install((await f.api.preview()).value.ticket);
  f.directories.add(data); f.files.set(`${data}/value`, { bytes: new Uint8Array([1,2]), version: 'old' }); f.files.set('vault-a:document.md', { bytes: new Uint8Array([7]), version: 'document' }); f.settings.set('test.package', { original: true });
  f.selected.push(packageBytes('2.0.0')); assert.equal((await f.api.update((await f.api.preview()).value.ticket)).error.code, 'RUNTIME_FAILED');
  assert.deepEqual(f.updateLifecycle, ['suspend','replace','resume:2.0.0','rollback','restore-data','resume:1.0.0','finish']);
  assert.deepEqual([...f.files.get(`${data}/value`).bytes], [1,2]); assert.equal(f.files.has(`${data}/new`), false); assert.deepEqual([...f.files.get('vault-a:document.md').bytes], [7]);
  assert.equal(f.api.snapshot().installations[0].version, '1.0.0'); assert.equal(f.api.snapshot().installations[0].recoveryRequired, true);
  assert.equal([...f.files.keys()].some(path => path.includes('/backups/')), false);
  await f.kernel.stopAll();
});

test('incomplete update recovery keeps its journal/backup and retries on environment restore', async () => {
  const data = 'vault-a:.lunaris/plugins/data/test.package';
  const f = await fixture({ onResume({ current, files, failWrites }) {
    if (current.version === '2.0.0') { files.set(`${data}/value`, { bytes: new Uint8Array([9]), version: 'candidate' }); failWrites(true); return failure('RUNTIME_FAILED'); }
  } });
  f.selected.push(packageBytes()); await f.api.install((await f.api.preview()).value.ticket);
  f.directories.add(data); f.files.set(`${data}/value`, { bytes: new Uint8Array([1,2]), version: 'old' });
  f.selected.push(packageBytes('2.0.0')); assert.equal((await f.api.update((await f.api.preview()).value.ticket)).error.code, 'STORAGE_FAILED');
  const registry = () => JSON.parse(new TextDecoder().decode(f.files.get('vault-a:.lunaris/plugins/registry.json').bytes));
  assert.ok(registry().plugins[0].updating); assert.ok([...f.files.keys()].some(path => path.endsWith('/manifest.json') && path.includes('/backups/')));
  assert.equal((await f.api.enable('test.package')).error.code, 'CONFLICT'); assert.equal((await f.api.remove('test.package', true)).error.code, 'CONFLICT');
  f.setFailWrites(false); assert.equal((await f.api.restore()).ok, true);
  assert.equal(registry().plugins[0].updating, undefined); assert.equal(registry().plugins[0].recoveryRequired, true);
  assert.deepEqual([...f.files.get(`${data}/value`).bytes], [1,2]); assert.deepEqual(f.executions, ['test.package']);
  assert.equal((await f.api.retry('test.package')).ok, true); assert.deepEqual(f.executions, ['test.package','test.package']);
  await f.kernel.stopAll();
});

test('successful update commits candidate managed data and removes its recovery backup', async () => {
  const data = 'vault-a:.lunaris/plugins/data/test.package';
  const f = await fixture({ onResume({ current, files, settings }) { if (current.version === '2.0.0') { files.set(`${data}/value`, { bytes: new Uint8Array([9]), version: 'new' }); settings.set('test.package', { migrated: true }); } } });
  f.selected.push(packageBytes()); await f.api.install((await f.api.preview()).value.ticket);
  f.directories.add(data); f.files.set(`${data}/value`, { bytes: new Uint8Array([1]), version: 'old' });
  f.selected.push(packageBytes('2.0.0')); assert.equal((await f.api.update((await f.api.preview()).value.ticket)).ok, true);
  assert.equal(f.api.snapshot().installations[0].version, '2.0.0'); assert.equal(f.api.snapshot().installations[0].recoveryRequired, false);
  assert.deepEqual([...f.files.get(`${data}/value`).bytes], [9]); assert.deepEqual(f.settings.get('test.package'), { migrated: true });
  assert.equal([...f.files.keys()].some(path => path.includes('/backups/')), false);
  await f.kernel.stopAll();
});

test('host bootstrap safe mode prevents installed package evaluation before explicit resume', async () => {
  const f = await fixture({ bootSafeMode: true }); assert.equal(f.api.snapshot().safeMode, true);
  f.selected.push(packageBytes()); const preview = await f.api.preview();
  assert.equal((await f.api.install(preview.value.ticket, true)).ok, true); assert.deepEqual(f.executions, []);
  await f.api.restore(); assert.deepEqual(f.executions, []);
  await f.api.restore(false); assert.deepEqual(f.executions, ['test.package']); await f.kernel.stopAll();
});
