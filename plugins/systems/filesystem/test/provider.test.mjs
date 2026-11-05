import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '@lunaris/sdk';
import { createTestKernel } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Filesystem, FilesystemDriver, DriverFileChanged, FileChanged, filesystemMethods } from '@lunaris/filesystem';
import filesystem from '@lunaris/filesystem-provider';

const manifest = (id, provides = [], requires = [], permissions = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides, requires, permissions, optionalPermissions: [] });
const requires = [{ kind: 'api', id: Filesystem.id, range: '^1.0.0' }, { kind: 'event', id: FileChanged.id, range: '^1.0.0' }];

async function setup(implementation = {}, options = {}) {
  const logs = []; const calls = []; const changes = []; let api; let driverContext;
  const host = createTestKernel({ initialGrants: { 'lunaris.filesystem-provider': ['filesystem.access'], 'test.driver': ['filesystem.native'], 'test.consumer': options.denied ? [] : ['filesystem.access'] } });
  host.installMock(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, (...args) => { logs.push([level, ...args]); return true; }])));
  const methods = Object.fromEntries(filesystemMethods.map(name => [name, async (...args) => { calls.push([name, ...args]); return { ok: true, value: null }; }]));
  methods.capabilities = () => ({ watch: true, atomicReplace: true, versionCheck: 'optimistic', trash: false, maxFileBytes: 1024 });
  Object.assign(methods, implementation);
  host.register(definePlugin({ manifest: manifest('test.driver', [{ kind: 'api', id: FilesystemDriver.id, version: '1.0.0' }, { kind: 'event', id: DriverFileChanged.id, version: '1.0.0' }], [], ['filesystem.native']), activate(ctx) { driverContext = ctx; ctx.provide(FilesystemDriver, methods); } }));
  host.register(filesystem);
  host.register(definePlugin({ manifest: manifest('test.consumer', [], requires, ['filesystem.access']), activate(ctx) { api = ctx.use(Filesystem); ctx.events.on(FileChanged, change => { changes.push(change); }); } }));
  if (options.denied) return { host };
  await host.start('test.consumer');
  return { host, api, calls, logs, changes, emit: change => driverContext.events.emit(DriverFileChanged, change) };
}

test('provider forwards explicit targets, write policy and binary snapshots through SDK', async () => {
  const { host, api, calls, logs } = await setup({ readText: async () => ({ ok: true, value: { text: 'hello', version: 'v1' } }) });
  const target = { vaultId: 'vault-a', path: 'notes/a.md' };
  assert.deepEqual((await api.readText(target)).value, { text: 'hello', version: 'v1' });
  await api.writeText(target, 'saved', { mode: 'replace', expectedVersion: 'v1' });
  assert.deepEqual(calls.at(-1), ['writeText', target, 'saved', { mode: 'replace', expectedVersion: 'v1' }]);
  const bytes = [0, 255]; await api.writeFile(target, bytes, { mode: 'create' });
  assert.deepEqual(calls.at(-1)[2], bytes); assert.notEqual(calls.at(-1)[2], bytes);
  assert.ok(logs.some(([level, , , details]) => level === 'info' && details?.code === 'FILESYSTEM_READY'));
  assert.deepEqual(host.diagnostics(), []);
  await host.stopAll(); host.assertNoResources();
});

test('invalid paths, root mutation, bytes and cross-Vault transfers never reach the driver', async () => {
  const { host, api, calls, logs } = await setup();
  for (const path of ['../outside', '/absolute', 'a/../b', 'NUL', 'C:/outside']) assert.equal((await api.readText({ vaultId: 'v', path })).error.code, 'INVALID_PATH');
  assert.equal((await api.remove({ vaultId: 'v', path: '' }, true)).error.code, 'INVALID_PATH');
  assert.equal((await api.writeFile({ vaultId: 'v', path: 'a' }, [256], { mode: 'create' })).error.code, 'INVALID_ARGUMENT');
  assert.equal((await api.writeText({ vaultId: 'v', path: 'a' }, 'text', { mode: 'create', expectedVersion: 'v1' })).error.code, 'INVALID_ARGUMENT');
  assert.equal((await api.move({ vaultId: 'v1', path: 'a' }, { vaultId: 'v2', path: 'b' })).error.code, 'INVALID_PATH');
  assert.equal(calls.length, 0); assert.ok(logs.some(([level]) => level === 'error'));
  await api.list({ vaultId: 'v', path: '' }); assert.equal(calls.at(-1)[0], 'list');
  await host.stopAll(); host.assertNoResources();
});

test('expected failures remain results, preserve diagnostic context and do not trigger host recovery diagnostics', async () => {
  const failure = { ok: false, error: { code: 'CONFLICT', message: 'File changed' } };
  const { host, api, logs } = await setup({ writeText: async () => failure });
  assert.deepEqual(await api.writeText({ vaultId: 'v', path: 'a.md' }, 'new', { mode: 'replace', expectedVersion: 'old' }), failure);
  assert.ok(logs.some(([level, , , details]) => level === 'error' && details.code === 'CONFLICT' && details.data.path === 'a.md'));
  assert.deepEqual(host.diagnostics(), []);
  await host.stopAll(); host.assertNoResources();
});

test('driver events are forwarded through owned SDK subscriptions', async () => {
  const { host, changes, emit } = await setup();
  const change = { vaultId: 'v', watchId: 'w', kind: 'modified', paths: ['a.md'] };
  await emit(change); assert.deepEqual(changes, [change]);
  await host.stop('lunaris.filesystem-provider');
  await emit(change); assert.equal(changes.length, 1);
  await host.stopAll(); host.assertNoResources();
});

test('consumer filesystem access is denied without the explicit SDK grant', async () => {
  const { host } = await setup({}, { denied: true });
  await assert.rejects(host.start('test.consumer'), error => error.code === 'ACTIVATION_FAILED' && error.cause?.code === 'PERMISSION_DENIED');
  await host.stopAll(); host.assertNoResources();
});
