import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestKernel } from '@lunaris/test';
import { definePlugin } from '@lunaris/sdk';
import { Logger } from '@lunaris/logging';
import { Config } from '@lunaris/config';
import { Filesystem, filesystemMethods } from '@lunaris/filesystem';
import { Vault, VaultChanged } from '@lunaris/vault';
import { ActiveDocument, BeforeActiveDocumentChange, ActiveDocumentTransitioned, ActiveDocumentChanged } from '@lunaris/active-document';
import provider from '@lunaris/active-document-provider';
const ok = value => ({ ok: true, value });
const fail = code => ({ ok: false, error: { code, message: code } });

test('document guards retain identity and settle failures; repeated open and relocation have explicit reasons', async () => {
  const s = await setup(); const target = { vaultId: 'a', path: 'note.md' };
  await s.api.open(target); await s.api.open(target);
  assert.deepEqual(s.transitions.map(value => value.reason), ['open', 'open']); assert.equal(s.changes.length, 1);
  let settled = 0;
  const registration = s.context.hooks.register(BeforeActiveDocumentChange, value => {
    value.onSettled(() => { settled++; }); return { ...value, error: { code: 'CONFLICT', message: 'Unsaved' } };
  });
  assert.equal((await s.api.close()).error.code, 'CONFLICT');
  assert.equal((await s.api.open({ ...target, path: 'other.md' })).ok, false);
  assert.equal(s.api.current().path, 'note.md'); assert.equal(settled, 2); registration.dispose();
  await s.api.relocate(target, { ...target, path: 'renamed.md' });
  assert.equal(s.transitions.at(-1).reason, 'relocate'); assert.equal(s.transitions.at(-1).previous.path, 'note.md');
  s.context.hooks.register(BeforeActiveDocumentChange, value => { value.onSettled(() => { settled++; }); throw new Error('Broken guard'); });
  assert.equal((await s.api.close()).ok, false); assert.equal(s.api.current().path, 'renamed.md'); assert.equal(settled, 3);
  await s.stop();
});
async function setup(options = {}) {
  const store = options.store ?? {}; const logs = []; const changes = []; const stats = [];
  let root = { id: 'a', name: 'A' }; let api; let emit; let context; const transitions = [];
  const kernel = createTestKernel({ initialGrants: { [provider.manifest.id]: ['vault.access', 'config.access', 'filesystem.access'], 'test.consumer': ['vault.access'] } });
  kernel.installMock(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, (...args) => { logs.push([level, ...args]); return true; }])));
  kernel.installMock(Config, {
    async get(id, key, scope) { await options.beforeRead?.(); return ok(store[scope.vaultId]); },
    async set(id, key, value, scope) { if (options.saveFailure) return fail('ACCESS_DENIED'); store[scope.vaultId] = value; return ok(null); },
    async remove(id, key, scope) { delete store[scope.vaultId]; return ok(true); }, async read() { return ok({}); },
  });
  kernel.installMock(Filesystem, { ...Object.fromEntries(filesystemMethods.map(name => [name, async () => ok(null)])),
    async stat(target) { stats.push(target); await options.beforeStat?.(target); return options.statFailure ? fail(options.statFailure) : ok({ path: target.path, kind: options.kind ?? 'file', size: 0, modifiedAt: null }); },
  });
  kernel.installMock(Vault, { current: () => root, async open() { return ok(root); }, async close() { return ok(null); } });
  const manifest = (id, provides, requires = [], permissions = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides, requires, permissions, optionalPermissions: [] });
  kernel.register(definePlugin({ manifest: manifest('test.events', [{ kind: 'event', id: VaultChanged.id, version: VaultChanged.version }]), activate(ctx) { emit = change => ctx.events.emit(VaultChanged, change); } }));
  kernel.register(provider);
  kernel.register(definePlugin({ manifest: manifest('test.consumer', [], [ActiveDocument, BeforeActiveDocumentChange, ActiveDocumentTransitioned, ActiveDocumentChanged].map(t => ({ kind: t.kind, id: t.id, range: '^' + t.version })), ['vault.access']), activate(ctx) { context = ctx; api = ctx.use(ActiveDocument); ctx.events.on(ActiveDocumentTransitioned, value => { transitions.push(value); }); ctx.events.on(ActiveDocumentChanged, value => { changes.push(value.current); }); } }));
  await kernel.start('test.events'); await kernel.start('test.consumer');
  return { api, context, transitions, store, logs, stats, changes, async switch(id) { const previous = root; root = id ? { id, name: id } : null; await emit({ kind: root ? 'switched' : 'closed', previous, current: root }); }, async stop() { await kernel.stopAll(); kernel.assertNoResources(); } };
}
test('persists and restores the last file independently per Vault and across provider restarts', async () => {
  const store = {}; let s = await setup({ store });
  assert.equal(s.api.current(), null);
  assert.equal((await s.api.open({ vaultId: 'a', path: 'folder/note.md' })).ok, true);
  assert.equal(Object.isFrozen(s.api.current()), true); assert.equal(store.a, 'folder/note.md');
  await s.switch('b'); assert.equal(s.api.current(), null);
  await s.api.open({ vaultId: 'b', path: 'other.txt' });
  await s.switch('a'); assert.equal(s.api.current().path, 'folder/note.md');
  await s.stop(); s = await setup({ store }); assert.equal(s.api.current().path, 'folder/note.md');
  await s.api.close(); assert.equal(s.api.current(), null); assert.equal(store.a, undefined); await s.stop();
});
test('validates files and targets, retains state on access failures and closes missing files', async () => {
  const options = {}; const s = await setup(options);
  assert.equal((await s.api.open({ vaultId: 'a', path: '../bad' })).ok, false);
  assert.equal((await s.api.open({ vaultId: 'b', path: 'other.md' })).ok, false);
  await s.api.open({ vaultId: 'a', path: 'note.md' });
  options.statFailure = 'ACCESS_DENIED'; await s.api.reconcile(); assert.equal(s.api.current().path, 'note.md');
  options.statFailure = 'NOT_FOUND'; await s.api.reconcile(); assert.equal(s.api.current(), null); assert.equal(s.store.a, undefined);
  options.statFailure = null; options.kind = 'directory'; assert.equal((await s.api.open({ vaultId: 'a', path: 'folder' })).ok, false);
  await s.stop();
});
test('confirmed folder moves remap the active descendant and persist the new path', async () => {
  const s = await setup(); await s.api.open({ vaultId: 'a', path: 'folder/sub/note.md' });
  await s.api.relocate({ vaultId: 'a', path: 'folder' }, { vaultId: 'a', path: 'renamed' });
  assert.equal(s.api.current().path, 'renamed/sub/note.md'); assert.equal(s.store.a, 'renamed/sub/note.md');
  await s.api.relocate({ vaultId: 'a', path: 'unrelated' }, { vaultId: 'a', path: 'other' }); assert.equal(s.api.current().path, 'renamed/sub/note.md');
  await s.stop();
});
test('missing saved paths are cleared and failed persistence leaves an active session usable', async () => {
  const missing = await setup({ store: { a: 'gone.md' }, statFailure: 'NOT_FOUND' }); assert.equal(missing.api.current(), null); assert.equal(missing.store.a, undefined); await missing.stop();
  const s = await setup({ saveFailure: true }); assert.equal((await s.api.open({ vaultId: 'a', path: 'note.md' })).ok, true); assert.equal(s.api.current().path, 'note.md'); assert.ok(s.logs.some(log => log[0] === 'warn')); await s.stop();
});
test('late file checks cannot reactivate a document from a previous Vault session', async () => {
  const pending = Promise.withResolvers(); const entered = Promise.withResolvers();
  const s = await setup({ beforeStat: async () => { entered.resolve(); await pending.promise; } });
  const opening = s.api.open({ vaultId: 'a', path: 'slow.md' }); await entered.promise;
  const switching = s.switch('b'); pending.resolve();
  assert.equal((await opening).ok, false); await switching; assert.equal(s.api.current(), null); assert.equal(s.store.a, undefined); await s.stop();
});
