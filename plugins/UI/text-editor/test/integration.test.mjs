import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { useBrowser } from '../../../../tools/test/browser.mjs';
import { EditorView } from '@codemirror/view';
import { undo } from '@codemirror/commands';
import { createTestKernel } from '@lunaris/test';
import { definePlugin } from '@lunaris/sdk';
import { Logger } from '@lunaris/logging';
import { Config } from '@lunaris/config';
import { Filesystem, FilesystemDriver, FilesystemRootsDriver, FilesystemObservationDriver, FilesystemLocationsDriver, DirectoryLocationsDriver, ApplicationDirectoryDriver, DriverFileChanged, filesystemMethods } from '@lunaris/filesystem';
import { Vault } from '@lunaris/vault';
import { ActiveDocument } from '@lunaris/active-document';
import { ActiveScreen } from '@lunaris/active-screen';
import { Components } from '@lunaris/components';
import { Themes } from '@lunaris/themes';
import { Workspace } from '@lunaris/workspace';
import filesystem from '@lunaris/filesystem-provider';
import vault from '@lunaris/vault-manager';
import documents from '@lunaris/active-document-provider';
import screenProvider from '@lunaris/active-screen-provider';
import screenHost from '@lunaris/active-screen-plugin';
import components from '@lunaris/component-provider';
import themes from '@lunaris/theme-provider';
import localization from '@lunaris/localization-manager';
import mantine from '@lunaris/mantine-components';
import editor from '@lunaris/text-editor';
import { createCloseGuard } from '../../../../hosts/tauri/dist/close-guard.js';

const ok = value => ({ ok: true, value });
const fail = code => ({ ok: false, error: { code, message: code } });
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(setImmediate); };
const metadata = (id, provides, requires = [], permissions = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides, requires, permissions, optionalPermissions: [] });
async function setup(options = {}) {
  const dom = useBrowser(new JSDOM('<div id="target"></div>', { pretendToBeVisual: true }));
  Object.defineProperty(globalThis, 'Window', { configurable: true, value: dom.window.Window });
  Object.defineProperty(globalThis, 'MutationObserver', { configurable: true, value: dom.window.MutationObserver });
  // JSDOM supplies no text geometry. These stubs exercise behavior, not layout.
  dom.window.Range.prototype.getClientRects = () => [];
  dom.window.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  const target = dom.window.document.getElementById('target');
  const kernel = createTestKernel(); const closeGuard = createCloseGuard(); const logs = []; const calls = []; const closed = new Set(); let selected = 0; let watchContext;
  const disk = new Map([['a/note.md', { text: options.initial ?? '# Note', version: 'v1' }], ['a/other.md', { text: 'Other', version: 'v1' }], ['a/image.png', { text: 'binary', version: 'v1' }], ['b/note.md', { text: '# B', version: 'v1' }]]);
  const store = new Map(); let content; let api; let host;
  kernel.installMock(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, (...args) => { logs.push([level, ...args]); return true; }])));
  kernel.installMock(Config, { async get(id, name, scope) { return ok(store.get(scope.vaultId)); }, async set(id, name, value, scope) { store.set(scope.vaultId, value); return ok(null); }, async remove(id, name, scope) { store.delete(scope.vaultId); return ok(true); }, async read() { return ok({}); } });
  kernel.installMock(Workspace, { register(value) { content = value; return ok(null); }, update() { return ok(null); }, list() { return content ? [content] : []; } });
  const methods = Object.fromEntries(filesystemMethods.map(name => [name, async () => ok(null)]));
  Object.assign(methods, {
    capabilities: () => ({ watch: false, atomicReplace: true, versionCheck: 'optimistic', trash: false, maxFileBytes: 1024 }),
    async stat(t) { return disk.has(`${t.vaultId}/${t.path}`) ? ok({ path: t.path, kind: 'file', size: 1, modifiedAt: 1 }) : fail('NOT_FOUND'); },
    async readText(t) { if (options.read) { const result = await options.read(t); if (result) return result; } return closed.has(t.vaultId) ? fail('VAULT_CLOSED') : disk.has(`${t.vaultId}/${t.path}`) ? ok({ ...disk.get(`${t.vaultId}/${t.path}`) }) : fail('NOT_FOUND'); },
    async writeText(t, text, policy) {
      calls.push(['write', { ...t }, text, policy]); const previous = disk.get(`${t.vaultId}/${t.path}`);
      if (options.writeFailure) return fail(options.writeFailure);
      if (closed.has(t.vaultId)) return fail('VAULT_CLOSED'); if (!previous) return fail('NOT_FOUND');
      if (previous.version !== policy.expectedVersion) return fail('CONFLICT');
      const version = `${previous.version}+`; disk.set(`${t.vaultId}/${t.path}`, { text, version }); return ok({ version });
    },
    async move(from, to) {
      calls.push(['move', from, to]);
      for (const [id, value] of [...disk]) if (id === `${from.vaultId}/${from.path}` || id.startsWith(`${from.vaultId}/${from.path}/`)) {
        disk.delete(id); disk.set(`${to.vaultId}/${to.path}` + id.slice(`${from.vaultId}/${from.path}`.length), value);
      }
      return ok(null);
    },
    async remove(t) { calls.push(['remove', t]); disk.delete(`${t.vaultId}/${t.path}`); return ok(null); },
    async closeVault(id) { calls.push(['close', id]); closed.add(id); return ok(null); },
  });
  kernel.register(definePlugin({ manifest: metadata('test.driver', [{ kind: 'api', id: FilesystemDriver.id, version: FilesystemDriver.version }, { kind: 'event', id: DriverFileChanged.id, version: DriverFileChanged.version }], [], ['filesystem.native']), activate(ctx) { watchContext = ctx; ctx.provide(FilesystemDriver, methods); } }));
  kernel.installMock(FilesystemRootsDriver, { async selectVault() { return ok({ id: ++selected === 1 ? 'a' : 'b', name: 'Vault' }); } }, { grants: ['filesystem.native'] });
  kernel.installMock(FilesystemObservationDriver, { async watch() { return ok('watch'); } }, { grants: ['filesystem.native'] });
  kernel.installMock(FilesystemLocationsDriver, { async select() { return ok(null); }, async describe() { return fail('NOT_FOUND'); }, async attach() { return fail('NOT_FOUND'); } }, { grants: ['filesystem.native'] });
  kernel.installMock(DirectoryLocationsDriver, { async create() { return fail('UNSUPPORTED'); } }, { grants: ['filesystem.native'] });
  kernel.installMock(ApplicationDirectoryDriver, { async openConfig() { return fail('UNSUPPORTED'); } }, { grants: ['filesystem.native'] });
  for (const plugin of [filesystem, vault, documents, screenProvider, screenHost, components, themes, localization, mantine, editor, closeGuard.plugin]) kernel.register(plugin);

  kernel.register(definePlugin({ manifest: metadata('test.consumer', [], [Filesystem, Vault, ActiveDocument, ActiveScreen, Components, Themes].map(t => ({ kind: t.kind, id: t.id, range: '^' + t.version })), ['vault.access', 'filesystem.access', 'ui.dom']), activate(ctx) {
    api = { ctx, fs: ctx.use(Filesystem), vault: ctx.use(Vault), documents: ctx.use(ActiveDocument), screens: ctx.use(ActiveScreen), components: ctx.use(Components), themes: ctx.use(Themes) };
  } }));
  for (const [id, grants] of Object.entries({ 'test.driver': ['filesystem.native'], 'lunaris.filesystem-provider': ['filesystem.access', 'filesystem.app-config'], 'lunaris.vault-manager': ['filesystem.access'], 'lunaris.active-document-provider': ['vault.access', 'config.access', 'filesystem.access'], 'lunaris.active-screen-provider': ['vault.access'], [screenHost.manifest.id]: ['ui.dom'], 'lunaris.component-provider': ['ui.dom'], 'lunaris.mantine-components': ['ui.dom'], 'lunaris.text-editor': ['ui.dom', 'vault.access', 'filesystem.access'], 'test.consumer': ['vault.access', 'filesystem.access', 'ui.dom'] })) for (const grant of grants) kernel.grant(id, grant);
  kernel.grant(closeGuard.plugin.manifest.id, 'vault.access');
  await kernel.start('test.consumer'); await kernel.start(mantine.manifest.id); await kernel.start(screenHost.manifest.id); await kernel.start(editor.manifest.id); await kernel.start(closeGuard.plugin.manifest.id);
  await api.vault.open(); await flush();
  host = api.components.mount(content.componentId, target, { workspace: { vaultId: 'a', vaultName: 'A' } }, api.ctx.signal);
  assert.equal(host.ok, true); await api.documents.open({ vaultId: 'a', path: 'note.md' }); await flush();
  return { ...api, target, dom, disk, calls, logs, kernel, beforeClose: closeGuard.beforeClose,
    cm() { const node = target.querySelector('.cm-editor'); assert.ok(node, target.textContent); return EditorView.findFromDOM(node); },
    edit(text) { const view = this.cm(); view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }); },
    async stop() { await flush(); await kernel.stopAll(); await flush(); kernel.assertNoResources(); assert.equal(target.childElementCount, 0); assert.ok(!kernel.diagnostics().some(d => d.code === 'CLEANUP_FAILED')); dom.window.close(); },
  };
}

test('composed editor retains history and selection through Settings, theme changes and renderer replacement', async () => {
  const s = await setup(); s.edit('# Draft'); await flush(); const view = s.cm(); view.dispatch({ selection: { anchor: 3 } });
  s.themes.register({ id: 'test.light', name: 'Light', properties: { appearance: 'light', colors: { background: '#ffffff', text: '#222222', selection: '#cccccc', caret: '#111111' } } }, s.ctx.signal);
  s.themes.select('test.light'); await flush(); assert.equal(s.cm(), view); assert.equal(view.state.selection.main.head, 3);
  const root = s.target.querySelector('.lm-text-editor'); assert.equal(root.style.backgroundColor, '');
  s.screens.register({ id: 'test.settings', componentId: 'lunaris.workspace-empty', props: { title: 'Settings', detail: '' } }, s.ctx.signal);
  s.screens.select('test.settings'); await flush(); assert.equal(view.dom.closest('[data-screen-id]').hidden, true);
  await s.documents.open({ vaultId: 'a', path: 'note.md' }); await flush(); assert.equal(s.screens.snapshot().activeId, 'lunaris.text-editor.screen'); assert.equal(s.cm(), view);
  assert.equal(s.disk.get('a/note.md').text, '# Draft');
  await s.kernel.stop(mantine.manifest.id); await s.kernel.start(mantine.manifest.id); await flush();
  assert.equal(s.cm().state.doc.toString(), '# Draft'); assert.equal(s.cm().state.selection.main.head, 3); assert.equal(undo(s.cm()), true);
  assert.equal(s.cm().state.doc.toString(), '# Note'); await s.stop();
});

test('conflicts block document and Vault departure, retain the buffer and recover by explicit reload', async () => {
  const s = await setup(); s.edit('Local draft'); await flush(); s.disk.set('a/note.md', { text: 'External change', version: 'external' });
  assert.equal((await s.documents.open({ vaultId: 'a', path: 'other.md' })).error.code, 'CONFLICT'); await flush();
  assert.equal(s.documents.current().path, 'note.md'); assert.equal(s.cm().state.doc.toString(), 'Local draft'); assert.match(s.target.textContent, /outside the editor/);
  assert.equal((await s.vault.close()).error.code, 'CONFLICT'); assert.equal(s.vault.current().id, 'a');
  assert.equal((await s.vault.open()).error.code, 'CONFLICT'); assert.equal(s.vault.current().id, 'a');
  assert.ok(!s.calls.some(call => call[0] === 'close' && call[1] === 'a')); assert.ok(s.calls.some(call => call[0] === 'close' && call[1] === 'b'));
  const button = name => [...s.target.querySelectorAll('button')].find(button => button.textContent === name);
  button('Reload from disk').click(); await flush(); assert.equal(s.cm().state.doc.toString(), 'Local draft');
  button('Discard changes and reload').click(); await flush(); assert.equal(s.cm().state.doc.toString(), 'External change');
  assert.equal((await s.vault.close()).ok, true); await s.stop();
});

test('file moves and deletion flush first, preserve buffer history and never recreate removed files', async () => {
  const s = await setup(); s.edit('Before move'); await flush();
  const source = { vaultId: 'a', path: 'note.md' }; const destination = { vaultId: 'a', path: 'renamed.md' };
  assert.equal((await s.fs.move(source, destination)).ok, true); await s.documents.relocate(source, destination); await flush();
  assert.equal(s.cm().state.doc.toString(), 'Before move'); assert.equal(s.documents.current().path, 'renamed.md');
  s.edit('After move'); await s.documents.open(destination); await flush();
  assert.equal(s.disk.get('a/renamed.md').text, 'After move'); assert.equal(s.disk.has('a/note.md'), false);
  assert.deepEqual(s.calls.slice(0, 2).map(call => call[0]), ['write', 'move']);
  s.edit('Before deletion'); assert.equal((await s.fs.remove(destination)).ok, true); await s.documents.reconcile(); await flush();
  assert.equal(s.disk.has('a/renamed.md'), false); assert.equal(s.documents.current(), null);
  assert.equal(s.calls.at(-1)[0], 'remove'); await s.stop();
});

test('unsupported files are not read as text and read failures never substitute an editable empty buffer', async () => {
  const options = {}; const s = await setup(options);
  await s.documents.open({ vaultId: 'a', path: 'image.png' }); await flush(); assert.equal(s.target.querySelector('.cm-editor'), null); assert.match(s.target.textContent, /not supported/);
  options.read = t => t.path === 'other.md' ? fail('ACCESS_DENIED') : undefined;
  await s.documents.open({ vaultId: 'a', path: 'other.md' }); await flush(); assert.equal(s.target.querySelector('.cm-editor'), null); assert.match(s.target.textContent, /Cannot read/);
  await s.stop();
});

test('Windows line endings survive editing, saving and theme reconfiguration', async () => {
  const s = await setup({ initial: '# Note\r\n\r\nParagraph\r\n' });
  assert.equal(s.cm().state.sliceDoc(), '# Note\r\n\r\nParagraph\r\n');
  s.cm().dispatch({ changes: { from: 0, insert: 'New\r\n' } });
  await s.documents.open({ vaultId: 'a', path: 'note.md' }); await flush();
  assert.equal(s.disk.get('a/note.md').text, 'New\r\n# Note\r\n\r\nParagraph\r\n');
  await s.stop();
});

test('headerless Live Preview retains the composed editor, source and history', async () => {
  const original = '# Heading\r\n\r\n**bold** and [label](https://example.com)\r\n';
  const s = await setup({ initial: original });
  const view = s.cm();
  assert.ok(view.dom.querySelector('.cm-preview-strong'));
  assert.equal(s.target.querySelector('.lm-editor-header'), null);
  assert.equal(s.target.querySelector('[aria-pressed]'), null);
  assert.equal(s.target.querySelector('button'), null);
  assert.equal(view.state.sliceDoc(), original);
  assert.equal(s.calls.some(call => call[0] === 'write'), false);
  view.dispatch({ changes: { from: view.state.doc.length, insert: 'New' }, selection: { anchor: 0 } });
  assert.ok(view.dom.querySelector('.cm-preview-strong'));
  assert.equal(undo(view), true);
  assert.equal(view.state.sliceDoc(), original);
  await s.kernel.stop(mantine.manifest.id); await s.kernel.start(mantine.manifest.id); await flush();
  assert.ok(s.cm().dom.querySelector('.cm-preview-strong'));
  await s.stop();
});

test('desktop close bridge flushes the last keystrokes before shutdown and rejects a failed save', async () => {
  const options = {}; const s = await setup(options); s.edit('Last keystrokes');
  options.writeFailure = 'ACCESS_DENIED'; assert.equal(await s.beforeClose(), false);
  assert.equal(s.vault.current().id, 'a'); assert.equal(s.cm().state.sliceDoc(), 'Last keystrokes');
  options.writeFailure = null; assert.equal(await s.beforeClose(), true);
  assert.equal(s.disk.get('a/note.md').text, 'Last keystrokes'); assert.equal(s.vault.current(), null);
  await s.kernel.stopAll(); await s.stop();
});

test('Tab inserts at the caret, indents selected lines and Shift-Tab removes indentation', async () => {
  const s = await setup({ initial: 'alpha\nbeta' });
  const view = s.cm();
  view.focus();
  const tab = (shiftKey = false) => {
    const event = new s.dom.window.KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, shiftKey, bubbles: true, cancelable: true });
    view.contentDOM.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
  };
  view.dispatch({ selection: { anchor: 2 } }); tab(); await flush();
  assert.equal(view.state.doc.toString(), 'al  pha\nbeta');
  assert.equal(view.state.selection.main.head, 4);
  undo(view);
  view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } }); tab(); await flush();
  assert.equal(view.state.doc.toString(), '    alpha\n    beta');
  tab(true); await flush(); assert.equal(view.state.doc.toString(), 'alpha\nbeta');
  view.setTabFocusMode(true);
  const escape = new s.dom.window.KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true });
  view.contentDOM.dispatchEvent(escape); assert.equal(escape.defaultPrevented, false); await flush();
  view.setTabFocusMode(false);
  view.dispatch({ selection: { anchor: 0 } }); tab(); await flush();
  await s.documents.open({ vaultId: 'a', path: 'note.md' }); await flush();
  assert.equal(s.disk.get('a/note.md').text, '    alpha\nbeta');
  const traces = s.logs.filter(log => log[3]?.code === 'EDITOR_TAB_TRACE').map(log => log[3].data);
  assert.equal(traces.filter(trace => trace.phase === 'received').length, 5);
  const outcomes = traces.filter(trace => trace.phase === 'settled');
  assert.equal(outcomes.length, 5);
  assert.equal(outcomes[0].commandRan, true); assert.equal(outcomes[0].lengthDelta, 2);
  assert.equal(outcomes[3].commandRan, false); assert.equal(outcomes[3].documentChanged, false);
  tab(); await flush();
  assert.equal(s.logs.filter(log => log[3]?.code === 'EDITOR_TAB_TRACE').length, 12);
  assert.ok(traces.some(trace => trace.phase === 'ready' && trace.diagnosticVersion === 2));
  assert.ok(traces.some(trace => trace.phase === 'first-key' && trace.inEditor && trace.focused));
  assert.ok(s.logs.some(log => log[3]?.code === 'EDITOR_TAB_TRACE' && log[2].includes('phase=settled') && log[2].includes('commandRan=true')));
  await s.stop();
});

test('focused selection layer uses the active theme instead of the CodeMirror default', async () => {
  const s = await setup(); const view = s.cm(); view.focus();
  // Geometry is unavailable in JSDOM. Supply a rectangle in CM's real selection
  // layer to verify stylesheet precedence rather than native range measurement.
  const marker = s.dom.window.document.createElement('div'); marker.className = 'cm-selectionBackground';
  view.scrollDOM.querySelector('.cm-selectionLayer').append(marker);
  for (const [id, appearance, selection, expected] of [
    ['dark', 'dark', '#4c4c4c', 'rgb(76, 76, 76)'],
    ['light', 'light', '#cccccc', 'rgb(204, 204, 204)'],
  ]) {
    s.themes.register({ id: `test.${id}`, name: id, properties: { appearance, colors: { selection } } }, s.ctx.signal);
    s.themes.select(`test.${id}`); await flush();
    assert.equal(s.dom.window.getComputedStyle(marker).backgroundColor, expected);
    assert.equal(s.cm(), view);
  }
  marker.remove(); await s.stop();
});

test('Tab diagnostics distinguish a different focus target without intercepting its navigation', async () => {
  const s = await setup(); const view = s.cm();
  const button = s.dom.window.document.createElement('button');
  s.dom.window.document.body.append(button); button.focus();
  const event = new s.dom.window.KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, bubbles: true, cancelable: true });
  button.dispatchEvent(event); await flush();
  assert.equal(event.defaultPrevented, false);
  const traces = s.logs.filter(log => log[3]?.code === 'EDITOR_TAB_TRACE').map(log => log[3].data);
  assert.ok(traces.some(trace => trace.phase === 'received' && !trace.inEditor && !trace.focused));
  assert.ok(traces.some(trace => trace.phase === 'settled' && !trace.commandRan && !trace.documentChanged));
  assert.equal(view.state.doc.toString(), '# Note');
  button.remove(); await s.stop();
});
