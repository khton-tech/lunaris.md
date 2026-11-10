import { WorkspaceSidebar } from "@lunaris/workspace";
import { ActiveDocument, ActiveDocumentChanged } from "@lunaris/active-document";
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { ContextMenu } from '@lunaris/context-menu';
import { Components } from '@lunaris/components';
import { createTestKernel } from '@lunaris/test';
import { definePlugin } from '@lunaris/sdk';
import { Logger } from '@lunaris/logging';
import { Filesystem, FilesystemObservation, FileChanged, filesystemMethods } from '@lunaris/filesystem';
import { Vault, VaultChanged, VaultHistory, VaultHistoryChanged } from '@lunaris/vault';
import { Sidebar } from '@lunaris/sidebar';
import { Localization } from '@lunaris/localization';
import sidebarProvider from '@lunaris/sidebar-provider';
import localization from '@lunaris/localization-manager';
import explorer from '@lunaris/file-explorer';
import contextMenuProvider from '@lunaris/context-menu-provider';
import componentProvider from '@lunaris/component-provider';
import { Config, ConfigChanged } from '@lunaris/config';
import { Settings } from '@lunaris/settings';
import settingsProvider from '@lunaris/settings-provider';

const flush = async () => { for (let n = 0; n < 4; n++) await new Promise(resolve => setImmediate(resolve)); };
const manifest = (id, provides = [], requires = [], permissions = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides, requires, permissions, optionalPermissions: [] });
async function setup(options = {}) {
  const kernel = createTestKernel({ initialGrants: { 'lunaris.file-explorer': ['config.access', 'filesystem.access', 'vault.access'], 'lunaris.context-menu-provider': ['ui.dom'], 'lunaris.component-provider': ['ui.dom'], 'test.inspect': ['ui.dom'] } });
  let overlayOpen = true;
  kernel.installMock(WorkspaceSidebar, { open() { overlayOpen=true; }, close() { overlayOpen=false; }, isOpen() { return overlayOpen; } });
  const logs = []; const watches = []; const lists = []; let current = { id: 'a', name: 'A' }; let emit;
  let document = null; let side; let locales; let menus; let components; let inspect; let settings;
  const values = options.preferences ?? new Map(); const writes = [];
  kernel.installMock(Config, { async read(id, target) { return options.preferenceRead ? options.preferenceRead(id, target) : { ok: true, value: values.get(target.vaultId) ?? {} }; },
    async set(id, key, value, target) { writes.push({ id, key, value, target }); const result = options.preferenceWrite ? await options.preferenceWrite(id, key, value, target) : { ok: true, value: null }; if (result.ok) values.set(target.vaultId, { ...values.get(target.vaultId), [key]: value }); return result; },
    async get() { return { ok: true, value: undefined }; }, async remove() { return { ok: true, value: false }; } });
  kernel.installMock(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, (...args) => { logs.push(args); return true; }])));
  kernel.installMock(Filesystem, { ...Object.fromEntries(filesystemMethods.map(method => [method, async () => ({ ok: true, value: null })])),
    list: async target => { lists.push(target); return { ok: true, value: target.path === '' ? [{ path: 'folder', kind: 'directory', size: 0, modifiedAt: null }, { path: 'file-' + target.vaultId + '.md', kind: 'file', size: 0, modifiedAt: null }] : [{ path: target.path + '/note-' + target.vaultId + '.md', kind: 'file', size: 0, modifiedAt: null }] }; },
  });
  kernel.installMock(FilesystemObservation, { watch: async (target, owner) => { watches.push({ target, owner }); return { ok: true, value: `watch-${target.vaultId}` }; } });
  kernel.installMock(ActiveDocument, { current: () => document, async open(target) { document = target; await emit(ActiveDocumentChanged, { current: document }); return { ok: true, value: null }; }, async close() { return { ok: true, value: null }; }, async relocate() { return { ok: true, value: null }; }, async reconcile() { return { ok: true, value: null }; } });
  kernel.installMock(Vault, { current: () => current, open: options.open ?? (async () => ({ ok: true, value: null })), close: options.close ?? (async () => { const previous = current; current = null; await emit(VaultChanged, { kind: 'closed', previous, current }); return { ok: true, value: null }; }) });
  kernel.installMock(VaultHistory, { list: options.list ?? (async () => ({ ok: true, value: options.entries ?? [] })), open: options.recent ?? (async () => ({ ok: true, value: current })) });
  kernel.register(definePlugin({ manifest: manifest('test.events', [ConfigChanged, FileChanged, VaultChanged, ActiveDocumentChanged, VaultHistoryChanged].map(token => ({ kind: 'event', id: token.id, version: token.version }))), activate(ctx) { emit = (token, value) => ctx.events.emit(token, value); } }));
  kernel.register(settingsProvider);
  kernel.register(componentProvider); kernel.register(contextMenuProvider); kernel.register(sidebarProvider); kernel.register(localization); kernel.register(explorer);
  kernel.register(definePlugin({ manifest: manifest('test.inspect', [], [Settings, Sidebar, Localization, ContextMenu, Components].map(token => ({ kind: 'api', id: token.id, range: '^1.0.0' })), ['ui.dom']), activate(ctx) { settings = ctx.use(Settings); side = ctx.use(Sidebar); locales = ctx.use(Localization); menus = ctx.use(ContextMenu); components = ctx.use(Components); inspect = ctx; } }));
  await kernel.start('test.events'); await kernel.start('test.inspect'); await kernel.start(explorer.manifest.id); await flush();
  return { overlayOpen:()=>overlayOpen, kernel, logs, watches, lists, side, locales, menus, components, inspect, settings, writes, emit, tab: () => side.snapshot().tabs[0], async switch(root) { const previous = current; current = root; await emit(VaultChanged, { kind: root ? (previous ? 'switched' : 'opened') : 'closed', previous, current }); await flush(); } };
}
test('SDK controller registers a localized sidebar tool, preserves collapsed state and refreshes only its own watch', async () => {
  const s = await setup();
  assert.equal(s.tab().componentId, 'lunaris.file-explorer'); assert.equal(s.tab().props.vaultId, 'a');
  assert.equal(s.tab().props.data[0].id, 'folder');
  assert.deepEqual(s.lists[0], { vaultId: 'a', path: '' });
  s.side.select(null); s.tab().props.onSelection(['folder']); s.tab().props.onToggle('folder', true); await flush();
  assert.equal(s.side.snapshot().activeId, null); assert.deepEqual(s.tab().props.expanded, ['folder']);
  const before = s.lists.length;
  await s.emit(FileChanged, { vaultId: 'other', watchId: 'watch-a', kind: 'rescan', paths: [] }); await flush(); assert.equal(s.lists.length, before);
  await s.emit(FileChanged, { vaultId: 'a', watchId: 'watch-a', kind: 'rescan', paths: [] }); await flush(); assert.ok(s.lists.length > before);
  s.locales.setLocale('ru'); await flush(); assert.equal(s.tab().title, 'Файлы');
  await s.kernel.stopAll(); s.kernel.assertNoResources();
});

test('file preferences restore, control reveal and persist sorting from the existing toolbar', async () => {
  const s = await setup({ preferences: new Map([['a', { sortDirection: 'desc', revealActiveFile: false }]]) });
  assert.equal(s.tab().props.sortDirection, 'desc');
  await s.tab().props.onOpen('folder/note-a.md'); await flush(); assert.equal(s.overlayOpen(), false);
  assert.deepEqual(s.tab().props.expanded, []); assert.equal(s.tab().props.activePath, 'folder/note-a.md');
  const item = s.settings.snapshot().items.find(item => item.id.endsWith('.reveal-active-file'));
  await item.onChange(true, { vaultId: 'a', signal: s.inspect.signal }); await flush();
  assert.deepEqual(s.tab().props.expanded, ['folder']);
  await s.tab().props.onSort('asc'); await flush();
  assert.equal(s.settings.snapshot().items.find(item => item.id.endsWith('.sort-direction')).value, 'asc');
  assert.deepEqual(s.writes.at(-1), { id: 'lunaris.file-explorer', key: 'sortDirection', value: 'asc', target: { scope: 'vault', vaultId: 'a' } });
  await s.switch({ id: 'b', name: 'B' }); assert.equal(s.tab().props.sortDirection, 'asc');
  const before = s.writes.length;
  await item.onChange(false, { vaultId: 'a', signal: s.inspect.signal }); assert.equal(s.writes.length, before);
  await s.kernel.stopAll(); s.kernel.assertNoResources();
});

test('sorting failure restores both toolbar and Settings, and late completion cannot change another Vault', async () => {
  const pending = Promise.withResolvers();
  const s = await setup({ preferenceWrite: () => pending.promise });
  const saving = s.tab().props.onSort('desc'); await flush(); assert.equal(s.tab().props.sortDirection, 'desc');
  await s.switch({ id: 'b', name: 'B' });
  pending.resolve({ ok: false, error: { code: 'IO_ERROR', message: 'Failed' } }); await saving; await flush();
  assert.equal(s.tab().props.sortDirection, 'asc'); assert.equal(s.writes[0].target.vaultId, 'a');
  await s.kernel.stopAll(); s.kernel.assertNoResources();
  const t = await setup({ preferenceWrite: async () => ({ ok: false, error: { code: 'IO_ERROR', message: 'Failed' } }) });
  await t.tab().props.onSort('desc'); await flush();
  assert.equal(t.tab().props.sortDirection, 'asc'); assert.ok(t.settings.snapshot().items.find(item => item.id.endsWith('.sort-direction')).error);
  await t.kernel.stopAll(); t.kernel.assertNoResources();
});
test('Vault switching cancels the old watch and stale view callbacks; restart releases registrations', async () => {
  const s = await setup(); const stale = s.tab().props;
  await s.switch({ id: 'b', name: 'B' });
  assert.equal(s.watches[0].owner.aborted, true); assert.equal(s.tab().props.vaultId, 'b');
  assert.deepEqual(s.watches[1].target, { vaultId: 'b', path: '' });
  assert.ok(s.tab().props.data.some(item => item.id === 'file-b.md'));
  assert.ok(!s.tab().props.data.some(item => item.id === 'file-a.md'));
  assert.equal(await stale.onCreate('', 'stale.md', false), false); stale.onSelection(['old']); await flush();
  assert.deepEqual(s.tab().props.selection, []);
  await s.kernel.stop(explorer.manifest.id); await flush(); assert.equal(s.watches[1].owner.aborted, true); assert.equal(s.side.snapshot().tabs.length, 0);
  await s.kernel.start(explorer.manifest.id); await flush(); assert.equal(s.side.snapshot().tabs.length, 1);
  assert.deepEqual(s.kernel.diagnostics(), []);
  await s.kernel.stopAll(); s.kernel.assertNoResources();
});

test('explorer opens shared contributions with explicit invocation context and expires them on Vault switch', async () => {
  const s = await setup(); const dom = new JSDOM('<button>Files</button>'); const target = dom.window.document.querySelector('button');
  let received; let invoked;
  s.components.register({ id: 'lunaris.context-menu', mount(host, props) { received = props; return { update() {}, dispose() {} }; } }, s.inspect.signal);
  s.menus.register({ id: 'test.inspect-file', build: context => context.source === 'lunaris.file-explorer' && context.target === 'file' ? [
    { kind: 'group', id: 'test.tools', label: 'Tools', children: [{ kind: 'action', id: 'test.inspect', label: 'Inspect', run: value => { invoked = value; } }] },
  ] : [] }, s.inspect.signal);
  const request = { target, x: 42, y: 64, label: 'Files', path: 'file-a.md', kind: 'file', selection: ['file-a.md'], destination: '', entries: [] };
  const old = s.tab().props;
  const opened = old.onContextMenu(request); assert.ok(opened); assert.equal(received.items[0].id, 'test.tools');
  assert.equal((await opened.execute('test.inspect')).ok, true);
  assert.equal(invoked.source, 'lunaris.file-explorer'); assert.equal(invoked.target, 'file');
  assert.deepEqual(invoked.data, { vaultId: 'a', path: 'file-a.md', selection: ['file-a.md'], destination: '' });
  const stale = old.onContextMenu(request); await s.switch({ id: 'b', name: 'B' });
  assert.equal((await stale.execute('test.inspect')).error.code, 'UNAVAILABLE');
  assert.equal(dom.window.document.querySelector('[data-lunaris-context-menu]'), null);
  assert.equal(old.onContextMenu(request), undefined);
  await s.kernel.stopAll(); s.kernel.assertNoResources(); dom.window.close();
});


test('active document events reveal its parents and selection clearing does not close it', async () => {
  const s = await setup();
  await s.tab().props.onOpen('folder/note-a.md'); await flush();
  assert.equal(s.tab().props.activePath, 'folder/note-a.md');
  assert.ok(s.tab().props.expanded.includes('folder'));
  assert.ok(s.tab().props.data[0].children.some(entry => entry.id === 'folder/note-a.md'));
  s.tab().props.onSelection([]); await flush(); assert.equal(s.tab().props.activePath, 'folder/note-a.md');
  const stale = s.tab().props; await s.switch({ id: 'b', name: 'B' });
  await stale.onOpen('file-a.md'); await flush(); assert.equal(s.tab().props.activePath, null);
  await s.kernel.stopAll(); s.kernel.assertNoResources();
});

const recents = Array.from({ length: 6 }, (_, i) => ({ name: 'Vault ' + i, location: { reference: 'ref-' + i, label: 'Folder ' + i } }));
test('Vault switcher limits history, guards concurrent requests and keeps the current tree on failure and closes it for the start screen', async () => {
  let complete; const calls = [];
  const s = await setup({ entries: recents, recent: reference => { calls.push(reference); return new Promise(resolve => { complete = resolve; }); } });
  const props = () => s.tab().props.vaultSwitcher;
  assert.equal(props().name, 'A'); assert.equal(props().entries.length, 4);
  props().onRecent('ref-4'); assert.equal(calls.length, 0);
  props().onRecent('ref-1'); props().onRecent('ref-2'); props().onChange(); await flush();
  assert.deepEqual(calls, ['ref-1']); assert.equal(props().busy, true);
  complete({ ok: false, error: { code: 'NOT_FOUND', message: 'Unavailable' } }); await flush();
  assert.equal(props().busy, false); assert.equal(props().error, 'switchFailed'); assert.equal(s.tab().props.vaultId, 'a');
  props().onChange(); await flush(); assert.equal(props().error, ''); assert.equal(props().name, ''); assert.equal(s.tab().props.vaultId, '');
  await s.emit(VaultHistoryChanged, { entries: recents.slice().reverse() }); await flush();
  assert.equal(props().entries[0].reference, 'ref-5');
  await s.switch({ id: 'b', name: 'B' }); assert.equal(props().name, 'B');
  const stale = props(); await s.kernel.stopAll(); stale.onChange(); stale.onRecent('ref-5'); s.kernel.assertNoResources();
});
test('Vault switcher rejects stale history loads and ignores pending results after shutdown', async () => {
  let resolveList; let resolveOpen;
  const s = await setup({ list: () => new Promise(resolve => { resolveList = resolve; }), close: () => new Promise(resolve => { resolveOpen = resolve; }) });
  await s.emit(VaultHistoryChanged, { entries: recents }); await flush();
  resolveList({ ok: true, value: [] }); await flush(); assert.equal(s.tab().props.vaultSwitcher.entries.length, 4);
  s.tab().props.vaultSwitcher.onChange(); await flush(); await s.kernel.stopAll();
  resolveOpen({ ok: false, error: { code: 'STOPPED', message: 'Stopped' } }); await flush();
  assert.deepEqual(s.kernel.diagnostics(), []); s.kernel.assertNoResources();
});
