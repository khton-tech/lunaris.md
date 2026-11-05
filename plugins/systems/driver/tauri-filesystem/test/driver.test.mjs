import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '@lunaris/sdk';
import { createTestKernel } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { FilesystemDriver, FilesystemRootsDriver, FilesystemLocationsDriver, ApplicationDirectoryDriver, DriverFileChanged } from '@lunaris/filesystem';
import { createTauriFilesystemDriver } from '@lunaris/tauri-filesystem';

async function setup(native) {
  const host = createTestKernel({ initialGrants: { 'lunaris.tauri-filesystem': ['filesystem.native'], 'test.consumer': ['filesystem.access', 'filesystem.app-config'] } });
  const logs = []; const changes = []; let api; let roots; let locations; let directories; let context;
  host.installMock(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, (...args) => { logs.push([level, ...args]); return true; }])));
  host.register(createTauriFilesystemDriver(native));
  host.register(definePlugin({ manifest: { manifestVersion: 1, id: 'test.consumer', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js',
    provides: [], requires: [FilesystemDriver, FilesystemRootsDriver, FilesystemLocationsDriver, ApplicationDirectoryDriver, DriverFileChanged].map(token => ({ kind: token.kind, id: token.id, range: '^1.0.0' })), permissions: ['filesystem.access', 'filesystem.app-config'], optionalPermissions: [] },
  activate(ctx) { context = ctx; api = ctx.use(FilesystemDriver); roots = ctx.use(FilesystemRootsDriver); locations = ctx.use(FilesystemLocationsDriver); directories = ctx.use(ApplicationDirectoryDriver); ctx.events.on(DriverFileChanged, change => { changes.push(change); }); } }));
  await host.start('test.consumer');
  return { host, api, roots, locations, directories, context, logs, changes };
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

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const flush = () => new Promise(resolve => setImmediate(resolve));

test('location selection cancellation has no attachment; late attachments are released on owner stop', async () => {
  const selected = deferred(); const attached = deferred(); const calls = [];
  const s = await setup({ async request(session, operation, args) {
    calls.push([operation, args]);
    if (operation === 'selectLocation') return selected.promise;
    if (operation === 'attachLocation') return attached.promise;
    return { ok: true, value: null };
  } });
  const selectionOwner = s.context.scope.child();
  const selection = s.locations.select(selectionOwner.signal);
  await selectionOwner.dispose();
  selected.resolve({ ok: true, value: { reference: 'saved', label: 'Notes' } });
  assert.equal((await selection).error.code, 'VAULT_CLOSED');
  assert.equal((await s.locations.select(selectionOwner.signal)).error.code, 'VAULT_CLOSED');
  assert.equal(calls.filter(([op]) => op === 'selectLocation').length, 1);
  const owner = s.context.scope.child();
  const opening = s.locations.attach({ reference: 'saved', label: 'Notes' }, owner.signal);
  await owner.dispose();
  attached.resolve({ ok: true, value: { id: 'late', name: 'Notes' } });
  assert.equal((await opening).error.code, 'VAULT_CLOSED');
  assert.ok(calls.some(([op, args]) => op === 'closeVault' && args.vaultId === 'late'));
  await s.host.stopAll(); s.host.assertNoResources(); assert.deepEqual(s.host.diagnostics(), []);
});

test('owned native roots close on owner stop without calling any SDK handle during whole-app shutdown', async () => {
  const calls = [];
  const s = await setup({ async request(session, operation, args) {
    calls.push([operation, args]);
    if (operation === 'selectVault') return { ok: true, value: { id: 'selected', name: 'Notes' } };
    if (operation === 'openConfig') return { ok: true, value: { id: 'config', name: 'App config' } };
    return { ok: true, value: null };
  } });
  await s.roots.selectVault(s.context.signal); await s.directories.openConfig(s.context.signal);
  await s.host.stopAll(); await flush(); s.host.assertNoResources();
  assert.deepEqual(calls.filter(([op]) => op === 'closeVault').map(([, args]) => args.vaultId).sort(), ['config', 'selected']);
  assert.equal(calls.at(-1)[0], 'end'); assert.deepEqual(s.host.diagnostics(), []);
});

test('cancelled ownership waits for pending native writes and rejects later work', async () => {
  const saved = deferred(); const closed = [];
  const s = await setup({ async request(session, operation, args) {
    if (operation === 'selectVault') return { ok: true, value: { id: 'v', name: 'Notes' } };
    if (operation === 'writeText') return saved.promise;
    if (operation === 'closeVault') closed.push(args.vaultId);
    return { ok: true, value: null };
  } });
  const scope = s.context.scope.child();
  await s.roots.selectVault(scope.signal);
  const write = s.api.writeText({ vaultId: 'v', path: 'note.md' }, 'text', { mode: 'upsert' });
  await scope.dispose(); await flush(); assert.deepEqual(closed, []);
  assert.equal((await s.api.readText({ vaultId: 'v', path: 'note.md' })).error.code, 'VAULT_CLOSED');
  saved.resolve({ ok: true, value: { version: 'saved' } }); await write; await flush();
  assert.deepEqual(closed, ['v']);
  await s.host.stopAll(); s.host.assertNoResources(); assert.deepEqual(s.host.diagnostics(), []);
});

test('late selections after owner stop are closed and already-aborted owners open no dialogs', async () => {
  const selected = deferred(); const calls = [];
  const s = await setup({ async request(session, operation, args) {
    calls.push([operation, args]);
    if (operation === 'selectVault') return selected.promise;
    return { ok: true, value: null };
  } });
  const scope = s.context.scope.child();
  const opening = s.roots.selectVault(scope.signal); await scope.dispose();
  selected.resolve({ ok: true, value: { id: 'late', name: 'Late' } });
  assert.equal((await opening).error.code, 'VAULT_CLOSED');
  assert.ok(calls.some(([op, args]) => op === 'closeVault' && args.vaultId === 'late'));
  assert.equal((await s.roots.selectVault(scope.signal)).error.code, 'VAULT_CLOSED');
  assert.equal(calls.filter(([op]) => op === 'selectVault').length, 1);
  assert.equal((await s.roots.selectVault({})).error.code, 'INVALID_ARGUMENT');
  await s.host.stopAll(); s.host.assertNoResources(); assert.deepEqual(s.host.diagnostics(), []);
});

test('automatic root release failures are retained in independent cleanup diagnostics', async () => {
  const original = new Error('Native cleanup failed');
  const s = await setup({ async request(session, operation) {
    if (operation === 'selectVault') return { ok: true, value: { id: 'v', name: 'Notes' } };
    if (operation === 'closeVault') throw original;
    return { ok: true, value: null };
  } });
  await s.roots.selectVault(s.context.signal);
  await s.host.stop('test.consumer'); await flush();
  await assert.rejects(s.host.stopAll(), error => error.code === 'CLEANUP_FAILED');
  assert.ok(s.host.diagnostics().some(item => item.code === 'CLEANUP_FAILED'));
  s.host.assertNoResources();
});
