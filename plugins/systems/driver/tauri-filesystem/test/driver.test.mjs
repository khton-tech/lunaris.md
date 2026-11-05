import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '@lunaris/sdk';
import { createTestKernel } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { FilesystemDriver, DriverFileChanged } from '@lunaris/filesystem';
import { createTauriFilesystemDriver } from '@lunaris/tauri-filesystem';

async function setup(native) {
  const host = createTestKernel({ initialGrants: { 'lunaris.tauri-filesystem': ['filesystem.native'], 'test.consumer': ['filesystem.access'] } });
  const logs = []; const changes = []; let api;
  host.installMock(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, (...args) => { logs.push([level, ...args]); return true; }])));
  host.register(createTauriFilesystemDriver(native));
  host.register(definePlugin({ manifest: { manifestVersion: 1, id: 'test.consumer', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js',
    provides: [], requires: [{ kind: 'api', id: FilesystemDriver.id, range: '^1.0.0' }, { kind: 'event', id: DriverFileChanged.id, range: '^1.0.0' }], permissions: ['filesystem.access'], optionalPermissions: [] },
  activate(ctx) { api = ctx.use(FilesystemDriver); ctx.events.on(DriverFileChanged, change => { changes.push(change); }); } }));
  await host.start('test.consumer');
  return { host, api, logs, changes };
}

test('driver contains transport errors, uses native session ownership and releases it on stop', async () => {
  const calls = []; const original = new Error('IPC unavailable');
  const { host, api, logs } = await setup({ async request(session, operation, args) {
    calls.push({ session, operation, args });
    if (operation === 'readText') throw original;
    return { ok: true, value: null };
  } });
  assert.equal((await api.readText({ vaultId: 'v', path: 'a.md' })).error.code, 'IO_ERROR');
  assert.ok(logs.some(([level, , , details]) => level === 'error' && details?.error === original));
  assert.deepEqual(host.diagnostics(), []);
  await host.stopAll(); host.assertNoResources();
  assert.equal(calls[0].operation, 'begin'); assert.equal(calls.at(-1).operation, 'end');
  assert.equal(calls[0].session, calls.at(-1).session);
});

test('watch callbacks are scoped to registered watches and ignored after unwatch/close/stop', async () => {
  let send;
  const { host, api, changes } = await setup({ async request(session, operation, args, callback) {
    if (operation === 'watch') { send = callback; return { ok: true, value: 'watch-1' }; }
    return { ok: true, value: null };
  } });
  await api.watch({ vaultId: 'v', path: '' });
  const change = { vaultId: 'v', watchId: 'watch-1', kind: 'modified', paths: ['a.md'] };
  send(change); await new Promise(resolve => setImmediate(resolve)); assert.equal(changes.length, 1);
  await api.unwatch('v', 'watch-1'); send(change); await new Promise(resolve => setImmediate(resolve)); assert.equal(changes.length, 1);
  await api.watch({ vaultId: 'v', path: '' }); await api.closeVault('v'); send(change); await new Promise(resolve => setImmediate(resolve)); assert.equal(changes.length, 1);
  await host.stopAll(); send(change); host.assertNoResources(); assert.deepEqual(host.diagnostics(), []);
});
