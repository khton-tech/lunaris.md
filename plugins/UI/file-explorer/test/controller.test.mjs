import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestKernel } from '@lunaris/test';
import { definePlugin } from '@lunaris/sdk';
import { Logger } from '@lunaris/logging';
import { Filesystem, FilesystemObservation, FileChanged, filesystemMethods } from '@lunaris/filesystem';
import { Vault, VaultChanged } from '@lunaris/vault';
import { Sidebar } from '@lunaris/sidebar';
import { Localization } from '@lunaris/localization';
import sidebarProvider from '@lunaris/sidebar-provider';
import localization from '@lunaris/localization-manager';
import explorer from '@lunaris/file-explorer';

const flush = async () => { for (let n = 0; n < 4; n++) await new Promise(resolve => setImmediate(resolve)); };
const manifest = (id, provides = [], requires = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides, requires, permissions: [], optionalPermissions: [] });
async function setup() {
  const kernel = createTestKernel({ initialGrants: { 'lunaris.file-explorer': ['filesystem.access', 'vault.access'] } });
  const logs = []; const watches = []; const lists = []; let current = { id: 'a', name: 'A' }; let emit;
  let side; let locales;
  kernel.installMock(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, (...args) => { logs.push(args); return true; }])));
  kernel.installMock(Filesystem, { ...Object.fromEntries(filesystemMethods.map(method => [method, async () => ({ ok: true, value: null })])),
    list: async target => { lists.push(target); return { ok: true, value: [{ path: 'folder', kind: 'directory', size: 0, modifiedAt: null }] }; },
  });
  kernel.installMock(FilesystemObservation, { watch: async (target, owner) => { watches.push({ target, owner }); return { ok: true, value: `watch-${target.vaultId}` }; } });
  kernel.installMock(Vault, { current: () => current, open: async () => ({ ok: true, value: null }), close: async () => ({ ok: true, value: null }) });
  kernel.register(definePlugin({ manifest: manifest('test.events', [FileChanged, VaultChanged].map(token => ({ kind: 'event', id: token.id, version: token.version }))), activate(ctx) { emit = (token, value) => ctx.events.emit(token, value); } }));
  kernel.register(sidebarProvider); kernel.register(localization); kernel.register(explorer);
  kernel.register(definePlugin({ manifest: manifest('test.inspect', [], [Sidebar, Localization].map(token => ({ kind: 'api', id: token.id, range: '^1.0.0' }))), activate(ctx) { side = ctx.use(Sidebar); locales = ctx.use(Localization); } }));
  await kernel.start('test.events'); await kernel.start('test.inspect'); await kernel.start(explorer.manifest.id); await flush();
  return { kernel, logs, watches, lists, side, locales, emit, tab: () => side.snapshot().tabs[0], async switch(root) { const previous = current; current = root; await emit(VaultChanged, { kind: root ? 'switched' : 'closed', previous, current }); await flush(); } };
}
test('SDK controller registers a localized sidebar tool, preserves collapsed state and refreshes only its own watch', async () => {
  const s = await setup();
  assert.equal(s.tab().componentId, 'lunaris.file-explorer'); assert.equal(s.tab().props.vaultId, 'a');
  assert.equal(s.tab().props.data[0].id, 'folder');
  s.side.select(null); s.tab().props.onSelection(['folder']); s.tab().props.onToggle('folder', true); await flush();
  assert.equal(s.side.snapshot().activeId, null); assert.deepEqual(s.tab().props.expanded, ['folder']);
  const before = s.lists.length;
  await s.emit(FileChanged, { vaultId: 'other', watchId: 'watch-a', kind: 'rescan', paths: [] }); await flush(); assert.equal(s.lists.length, before);
  await s.emit(FileChanged, { vaultId: 'a', watchId: 'watch-a', kind: 'rescan', paths: [] }); await flush(); assert.ok(s.lists.length > before);
  s.locales.setLocale('ru'); await flush(); assert.equal(s.tab().title, 'Файлы');
  await s.kernel.stopAll(); s.kernel.assertNoResources();
});
test('Vault switching cancels the old watch and stale view callbacks; restart releases registrations', async () => {
  const s = await setup(); const stale = s.tab().props;
  await s.switch({ id: 'b', name: 'B' });
  assert.equal(s.watches[0].owner.aborted, true); assert.equal(s.tab().props.vaultId, 'b');
  assert.equal(await stale.onCreate('', 'stale.md', false), false); stale.onSelection(['old']); await flush();
  assert.deepEqual(s.tab().props.selection, []);
  await s.kernel.stop(explorer.manifest.id); await flush(); assert.equal(s.watches[1].owner.aborted, true); assert.equal(s.side.snapshot().tabs.length, 0);
  await s.kernel.start(explorer.manifest.id); await flush(); assert.equal(s.side.snapshot().tabs.length, 1);
  assert.deepEqual(s.kernel.diagnostics(), []);
  await s.kernel.stopAll(); s.kernel.assertNoResources();
});
