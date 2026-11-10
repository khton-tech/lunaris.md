import { Drafts } from '@lunaris/remote';
import { FilesystemSources } from '@lunaris/filesystem';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { useBrowser, typeInput } from '../../../../tools/test/browser.mjs';
import { EditorView } from '@codemirror/view';
import { undo, redo } from '@codemirror/commands';
import { StateEffect, EditorState, Prec } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { createTestKernel } from '@lunaris/test';
import { definePlugin } from '@lunaris/sdk';
import { Clipboard } from '@lunaris/clipboard';
import menuProvider from '@lunaris/context-menu-provider';
import { Logger } from '@lunaris/logging';
import { Config, ConfigChanged } from '@lunaris/config';
import { Settings } from '@lunaris/settings';
import settingsProvider from '@lunaris/settings-provider';
import { Filesystem, FilesystemDriver, FilesystemRootsDriver, FilesystemObservationDriver, FilesystemLocationsDriver, DirectoryLocationsDriver, ApplicationDirectoryDriver, DriverFileChanged, filesystemMethods } from '@lunaris/filesystem';
import { Vault } from '@lunaris/vault';
import { DocumentStatistics, DocumentStatisticsChanged, ActiveDocument } from '@lunaris/active-document';
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
import { Localization } from '@lunaris/localization';
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
  const clipboardCalls = [];
  kernel.installMock(Clipboard, { capabilities: () => ({ read: true, write: true }), async readText() { clipboardCalls.push(["read"]); if (options.readClipboard) return options.readClipboard(); return options.clipboardFailure ? fail("DENIED") : ok(options.clipboardText ?? "Pasted"); }, async writeText(text) { clipboardCalls.push(["write", text]); return options.clipboardFailure ? fail("DENIED") : ok(null); } });
  kernel.installMock(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, (...args) => { logs.push([level, ...args]); return true; }])));
  const preferenceWrites = []; const preferenceStore = options.preferences ?? new Map();
  kernel.installMock(Config, { async get(id, name, scope) { return ok(store.get(scope.vaultId)); }, async set(id, name, value, scope) {
    if (id === editor.manifest.id) {
      preferenceWrites.push({ id, name, value, scope });
      const result = options.preferenceWrite ? await options.preferenceWrite(id, name, value, scope) : ok(null);
      if (result.ok) preferenceStore.set(scope.vaultId, { ...preferenceStore.get(scope.vaultId), [name]: value });
      return result;
    }
    store.set(scope.vaultId, value); return ok(null);
  }, async remove(id, name, scope) { store.delete(scope.vaultId); return ok(true); }, async read(id, scope) { return options.preferenceRead ? options.preferenceRead(id, scope) : ok(preferenceStore.get(scope.vaultId) ?? {}); } });
  if (options.drafts) {
    kernel.installMock(Drafts,options.drafts);
    kernel.installMock(FilesystemSources,{locationVisible:()=>true,list:()=>['remote'],location:()=>fail('UNSUPPORTED'),remoteIdentity:()=>ok({server:'https://server',accountId:'alice',vaultId:'stable-vault'}),capabilitiesFor:()=>fail('UNSUPPORTED')});
  }
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
  kernel.register(definePlugin({ manifest: metadata('test.config-events', [{ kind: 'event', id: ConfigChanged.id, version: ConfigChanged.version }]), activate() {} }));
  for (const plugin of [settingsProvider, menuProvider, filesystem, vault, documents, screenProvider, screenHost, components, themes, localization, mantine, editor, closeGuard.plugin]) kernel.register(plugin);

  kernel.register(definePlugin({ manifest: metadata('test.consumer', [], [Settings, DocumentStatistics, DocumentStatisticsChanged, Filesystem, Vault, ActiveDocument, ActiveScreen, Components, Themes, Localization].map(t => ({ kind: t.kind, id: t.id, range: '^' + t.version })), ['vault.access', 'filesystem.access', 'ui.dom']), activate(ctx) {
    api = { ctx, settings: ctx.use(Settings), statistics: ctx.use(DocumentStatistics), fs: ctx.use(Filesystem), vault: ctx.use(Vault), documents: ctx.use(ActiveDocument), screens: ctx.use(ActiveScreen), components: ctx.use(Components), themes: ctx.use(Themes), language: ctx.use(Localization) };
  } }));
  for (const [id, grants] of Object.entries({ 'test.driver': ['filesystem.native'], 'lunaris.filesystem-provider': ['filesystem.access', 'filesystem.app-config'], 'lunaris.vault-manager': ['filesystem.access'], 'lunaris.active-document-provider': ['vault.access', 'config.access', 'filesystem.access'], 'lunaris.active-screen-provider': ['vault.access'], [screenHost.manifest.id]: ['ui.dom'], 'lunaris.component-provider': ['ui.dom'], 'lunaris.mantine-components': ['ui.dom'], 'lunaris.context-menu-provider': ['ui.dom'], 'lunaris.text-editor': ['clipboard.access', 'ui.dom', 'vault.access', 'filesystem.access'], 'test.consumer': ['vault.access', 'filesystem.access', 'ui.dom'] })) for (const grant of grants) kernel.grant(id, grant);
  kernel.grant(closeGuard.plugin.manifest.id, 'vault.access');
  kernel.grant(editor.manifest.id, 'config.access');
  if(options.drafts) kernel.grant(editor.manifest.id,'drafts.access');
  await kernel.start('test.consumer'); await kernel.start(mantine.manifest.id); await kernel.start(screenHost.manifest.id); await kernel.start(editor.manifest.id); await kernel.start(closeGuard.plugin.manifest.id);
  await api.vault.open(); await flush();
  let editorTarget = target;
  if (options.withLayout) {
    let regions;
    const layout = api.components.mount('lunaris.workspace-layout', target, {
      railVisible: true, panelVisible: true, mainLabel: 'Editor', panelLabel: 'Files',
      onTargets(value) { regions = value; }, onDismiss() {},
    }, api.ctx.signal);
    assert.equal(layout.ok, true); assert.ok(regions?.main); editorTarget = regions.main;
  }
  host = api.components.mount(content.componentId, editorTarget, { workspace: { vaultId: 'a', vaultName: 'A' } }, api.ctx.signal);
  assert.equal(host.ok, true); await api.documents.open({ vaultId: 'a', path: 'note.md' }); await flush();
  return { ...api, target, dom, disk, calls, logs, kernel, clipboardCalls, preferenceWrites, beforeClose: closeGuard.beforeClose,
    async showVault(vaultId) { host.value.dispose(); await flush(); host = api.components.mount(content.componentId, editorTarget, { workspace: { vaultId, vaultName: vaultId } }, api.ctx.signal); assert.equal(host.ok, true); },
    cm() { const node = target.querySelector('.cm-editor'); assert.ok(node, target.textContent); return EditorView.findFromDOM(node); },
    edit(text) { const view = this.cm(); view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }); },
    async stop() { await flush(); await kernel.stopAll(); await flush(); kernel.assertNoResources(); assert.equal(target.childElementCount, 0); assert.ok(!kernel.diagnostics().some(d => d.code === 'CLEANUP_FAILED')); dom.window.close(); },
  };
}

test('composed editor keeps text before underline markers as paragraphs and retains hash headings', async () => {
  const s = await setup();
  try {
    for (const marker of ['-', '--', '---', '=', '===']) {
      const source = `Пример строки 1\n${marker}`;
      s.edit(source); await flush();
      assert.ok(!syntaxTree(s.cm().state).toString().includes('Heading'));
      assert.equal(s.target.querySelector('.cm-preview-heading'), null);
      assert.equal(s.cm().state.doc.toString(), source);
    }
    s.edit('## Heading'); await flush();
    assert.ok(syntaxTree(s.cm().state).toString().includes('ATXHeading2'));
    assert.ok(s.target.querySelector('.cm-preview-h2'));
  } finally { await s.stop(); }
});

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

test('Russian locale updates editor accessibility, menus and link shortcuts without remounting', async () => {
  const s = await setup({ initial: '' });
  try {
    const view = s.cm();
    assert.equal(s.language.setLocale('ru').ok, true); await flush();
    assert.equal(s.cm(), view); assert.equal(view.contentDOM.getAttribute('aria-label'), 'Редактор Markdown');
    view.contentDOM.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'k', code: 'KeyK', keyCode: 75, ctrlKey: true, bubbles: true, cancelable: true }));
    await flush(); assert.equal(view.state.sliceDoc(), '[Текст ссылки](https://)');
    const item = await editorMenu(s); assert.ok(item('Полужирный')); assert.ok(item('Списки'));
  } finally { await s.stop(); }
});

test('display preferences apply without replacing the editor, selection, source or undo history', async () => {
  const s = await setup(); const view = s.cm();
  assert.equal(view.contentDOM.getAttribute('spellcheck'), 'false');
  s.edit('Retained draft'); view.dispatch({ selection: { anchor: 4 } });
  const choose = async (key, value) => {
    const item = s.settings.snapshot().items.find(item => item.id.endsWith('.' + key)); assert.ok(item);
    await item.onChange(value, { vaultId: 'a', signal: s.ctx.signal }); await flush();
  };
  const heading = s.target.querySelector('.lm-editor-heading');
  const assertColumn = width => {
    assert.equal(heading.style.maxWidth, width);
    assert.equal(s.dom.window.getComputedStyle(view.contentDOM).maxWidth, width);
  };
  assertColumn('780px');
  for (const width of ['640', '960', '780']) {
    await choose('text-width', width); assertColumn(`${width}px`);
  }
  await choose('font-size', 20);
  await choose('line-height', 1.8);
  await choose('text-width', 'full');
  assertColumn('none');
  await choose('text-width', '640');
  await choose('wrap-lines', false);
  assertColumn('none');
  await choose('wrap-lines', true); assertColumn('640px');
  await choose('wrap-lines', false);
  assert.equal(s.cm(), view); assert.equal(view.state.selection.main.head, 4);
  assert.equal(view.state.sliceDoc(), 'Retained draft'); assert.equal(view.contentDOM.classList.contains('cm-lineWrapping'), false);
  assert.equal(s.dom.window.getComputedStyle(view.dom).fontSize, '20px');
  assert.equal(s.dom.window.getComputedStyle(view.scrollDOM).lineHeight, '1.8');
  assert.equal(s.dom.window.getComputedStyle(view.contentDOM).maxWidth, 'none');
  assert.ok(s.preferenceWrites.every(write => write.id === 'lunaris.text-editor' && write.scope.scope === 'vault' && write.scope.vaultId === 'a'));
  assert.deepEqual(s.settings.snapshot().items.map(item => item.id.split('.').at(-1)), ['font-size', 'line-height', 'text-width', 'wrap-lines']);
  assert.equal(undo(view), true); assert.equal(view.state.sliceDoc(), '# Note');
  await s.stop();
});

test('display preferences restore before Settings opens and reset on Vault switch', async () => {
  const s = await setup({ preferences: new Map([['a', { fontSize: '24', wrapLines: false }]]) });
  assert.equal(s.dom.window.getComputedStyle(s.cm().dom).fontSize, '24px'); assert.equal(s.cm().contentDOM.classList.contains('cm-lineWrapping'), false);
  await s.vault.open(); await flush();
  await s.documents.open({ vaultId: 'b', path: 'note.md' }); await flush();
  await s.showVault('b'); await flush();
  assert.equal(s.dom.window.getComputedStyle(s.cm().dom).fontSize, '14px'); assert.equal(s.cm().contentDOM.classList.contains('cm-lineWrapping'), true);
  assert.equal(s.preferenceWrites.length, 0); await s.stop();
});

test('failed preference writes restore live appearance and leave retryable editing available', async () => {
  const s = await setup({ preferenceWrite: async () => fail('IO_ERROR') }); const view = s.cm();
  const item = s.settings.snapshot().items.find(item => item.id.endsWith('.font-size'));
  await item.onChange(24, { vaultId: 'a', signal: s.ctx.signal }); await flush();
  assert.equal(s.cm(), view); assert.equal(s.dom.window.getComputedStyle(view.dom).fontSize, '14px');
  const failed = s.settings.snapshot().items.find(current => current.id === item.id);
  assert.ok(failed.error); assert.equal(failed.disabled, false);
  await s.stop();
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

test('typing feedback composes with Workspace and Live Preview without saving deleted afterimages', async () => {
  const s = await setup({ initial: '**bold** text', withLayout: true });
  try {
    const view = s.cm(); const end = view.state.doc.length;
    view.dispatch({ changes: { from: end, insert: 'я' }, selection: { anchor: end + 1 }, userEvent: 'input.type' });
    assert.equal(view.dom.querySelector('.cm-typing-insertion').textContent, 'я');
    assert.ok(view.dom.querySelector('.cm-preview-strong'));
    view.dispatch({ changes: { from: end, to: end + 1 }, selection: { anchor: end }, userEvent: 'delete.backward' });
    assert.equal(view.dom.querySelector('.cm-typing-deletion').textContent, 'я');
    assert.equal(view.state.sliceDoc(), '**bold** text');
    await s.documents.open({ vaultId: 'a', path: 'note.md' }); await flush();
    assert.equal(s.disk.get('a/note.md').text, '**bold** text');
    assert.equal(s.cm(), view);
  } finally { await s.stop(); }
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
  const s = await setup({ initial: 'alpha\nbeta', withLayout: true });
  const view = s.cm();
  view.focus();
  const tab = (shiftKey = false) => {
    const event = new s.dom.window.KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, shiftKey, bubbles: true, cancelable: true });
    view.contentDOM.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
  };
  view.dispatch({ selection: { anchor: 2 } }); tab(); await flush();
  assert.equal(view.state.doc.toString(), 'al\tpha\nbeta');
  assert.equal(view.state.selection.main.head, 3);
  undo(view);
  view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } }); tab(); await flush();
  assert.equal(view.state.doc.toString(), '\talpha\n\tbeta');
  tab(true); await flush(); assert.equal(view.state.doc.toString(), 'alpha\nbeta');
  view.setTabFocusMode(true);
  const escape = new s.dom.window.KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true });
  view.contentDOM.dispatchEvent(escape); assert.equal(escape.defaultPrevented, false); await flush();
  view.setTabFocusMode(false);
  view.dispatch({ selection: { anchor: 0 } }); tab(); await flush();
  await s.documents.open({ vaultId: 'a', path: 'note.md' }); await flush();
  assert.equal(s.disk.get('a/note.md').text, '\talpha\nbeta');
  await s.stop();
});

test('Workspace tasks toggle real Mantine checkboxes, retain focus/history and save CRLF source', async () => {
  const original = '# Tasks\r\n\r\n- [ ] First\r\n- [X] Second\r\n';
  const s = await setup({ initial: original, withLayout: true });
  try {
    const view = s.cm();
    const checkboxes = () => [...view.dom.querySelectorAll('input[type=checkbox]')];
    assert.deepEqual(checkboxes().map(input => input.checked), [false, true]);
    assert.equal(checkboxes()[0].getAttribute('aria-label'), 'First');
    assert.equal(s.calls.length, 0);
    assert.ok(checkboxes()[0].closest('.mantine-Checkbox-root'));
    const selection = view.state.selection;
    checkboxes()[0].focus(); checkboxes()[0].click(); await flush();
    assert.equal(view.state.sliceDoc(), original.replace('[ ]', '[x]'));
    assert.equal(view.state.selection.eq(selection), true);
    assert.equal(s.dom.window.document.activeElement, checkboxes()[0]);
    assert.equal(undo(view), true); await flush(); assert.equal(view.state.sliceDoc(), original);
    assert.equal(redo(view), true); await flush(); assert.equal(checkboxes()[0].checked, true);
    checkboxes()[1].click(); await flush(); assert.equal(checkboxes()[1].checked, false);
    await s.documents.open({ vaultId: 'a', path: 'note.md' }); await flush();
    assert.equal(s.disk.get('a/note.md').text, original.replace('[ ]', '[x]').replace('[X]', '[ ]'));
  } finally { await s.stop(); }
});

test('task source reveals at the marker, task text remains editable, and code/escapes remain literal', async () => {
  const original = '# Tasks\n\n- [ ] First\n\t\t- [x] Deep\n\n1. [ ] Ordered\n\n```md\n- [ ] Code\n```\n\n\\- [ ] Escaped\n\n`- [ ] Inline`';
  const s = await setup({ initial: original, withLayout: true });
  try {
    const view = s.cm();
    const boxes = () => [...view.dom.querySelectorAll('input[type=checkbox]')];
    await flush();
    assert.deepEqual(boxes().map(input => input.getAttribute('aria-label')), ['First', 'Deep', 'Ordered']);
    view.dispatch({ selection: { anchor: original.indexOf('First') + 2 } });
    assert.equal(boxes().length, 3);
    view.dispatch({ selection: { anchor: original.indexOf('[ ]') + 1 } });
    assert.equal(boxes().length, 2); assert.ok(view.contentDOM.textContent.includes('- [ ] First'));
    view.dispatch({ selection: { anchor: 0 } });
    view.dispatch({ changes: { from: 0, insert: 'Intro\n\n' } });
    boxes()[2].click(); await flush();
    assert.equal(view.state.sliceDoc(), 'Intro\n\n' + original.replace('1. [ ] Ordered', '1. [x] Ordered'));
    view.dispatch({ effects: StateEffect.appendConfig.of(Prec.highest([EditorState.readOnly.of(true), EditorView.editable.of(false)])) });
    assert.ok(boxes().every(input => input.disabled));
    const locked = view.state.sliceDoc(); boxes()[0].click(); await flush(); assert.equal(view.state.sliceDoc(), locked);
  } finally { await s.stop(); }
});

test('task renderer replacement preserves edits and checkbox save failures retain the buffer', async () => {
  const options = { initial: '# Tasks\n\n- [ ] Keep' };
  const s = await setup(options);
  try {
    s.target.querySelector('input[type=checkbox]').click(); await flush();
    const edited = '# Tasks\n\n- [x] Keep';
    await s.kernel.stop(mantine.manifest.id); await s.kernel.start(mantine.manifest.id); await flush();
    assert.equal(s.cm().state.sliceDoc(), edited);
    assert.equal(s.target.querySelector('input[type=checkbox]').checked, true);
    options.writeFailure = 'IO_ERROR';
    assert.equal((await s.documents.open({ vaultId: 'a', path: 'other.md' })).ok, false); await flush();
    assert.equal(s.cm().state.sliceDoc(), edited);
    assert.equal(s.disk.get('a/note.md').text, options.initial);
    assert.equal(s.documents.current().path, 'note.md');
  } finally { await s.stop(); }
});

test('inline code keeps a single outline around animated letters in the composed Workspace editor', async () => {
  const s = await setup({ initial: '', withLayout: true });
  try {
    const view = s.cm();
    const type = text => {
      const { from, to } = view.state.selection.main;
      const handled = view.state.facet(EditorView.inputHandler).some(handler => handler(view, from, to, text,
        () => view.state.update(view.state.replaceSelection(text))));
      if (!handled) view.dispatch(view.state.update(view.state.replaceSelection(text), { userEvent: 'input.type' }));
    };
    type('`');
    for (const letter of ['a', 'b', 'c']) {
      type(letter);
      assert.equal(view.dom.querySelectorAll('.cm-preview-code').length, 1);
      assert.equal(view.dom.querySelectorAll('.cm-typing-insertion .cm-preview-code').length, 0);
      assert.ok(view.dom.querySelector('.cm-preview-code .cm-typing-insertion'));
    }
    view.dispatch({ selection: { anchor: 2 } }); type('x');
    assert.equal(view.dom.querySelectorAll('.cm-preview-code').length, 1);
    view.dispatch({ changes: { from: 2, to: 3 }, selection: { anchor: 2 }, userEvent: 'delete.backward' });
    assert.equal(view.dom.querySelectorAll('.cm-preview-code').length, 1);
    assert.ok(view.dom.querySelector('.cm-preview-code .cm-typing-deletion'));
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(view.dom.querySelectorAll('.cm-preview-code').length, 1);
    await s.documents.open({ vaultId: 'a', path: 'note.md' }); await flush();
    assert.equal(s.disk.get('a/note.md').text, '`abc`');
  } finally { await s.stop(); }
});

test('Workspace editor auto-pairs Markdown input and saves the unchanged closing delimiters', async () => {
  const s = await setup({ initial: '', withLayout: true });
  try {
    const view = s.cm();
    const type = text => {
      const { from, to } = view.state.selection.main;
      const handled = view.state.facet(EditorView.inputHandler).some(handler => handler(view, from, to, text,
        () => view.state.update(view.state.replaceSelection(text))));
      if (!handled) view.dispatch(view.state.update(view.state.replaceSelection(text), { userEvent: 'input.type' }));
    };
    type('('); type('['); type('{'); type('`'); type('code'); type('`'); type('}'); type(']'); type(')');
    type(' '); type('*'); type('*'); type('bold'); type('*'); type('*');
    assert.equal(view.state.sliceDoc(), '([{`code`}]) **bold**');
    assert.equal(view.state.selection.main.head, view.state.doc.length);
    await s.documents.open({ vaultId: 'a', path: 'note.md' }); await flush();
    assert.equal(s.disk.get('a/note.md').text, '([{`code`}]) **bold**');
  } finally { await s.stop(); }
});

test('Workspace code cards retain source, theme inheritance and saving through fence edits', async () => {
  const original = 'Note\r\n\r\n```js\r\nconst value = 1;\r\n```';
  const s = await setup({ withLayout: true, initial: original });
  try {
    const view = s.cm();
    for (const [appearance, text, secondary] of [['light', '#222222', '#555555'], ['dark', '#eeeeee', '#aaaaaa']]) {
      s.themes.register({ id: `code.${appearance}`, name: appearance, properties: { appearance, colors: { text, textSecondary: secondary } } }, s.ctx.signal);
      s.themes.select(`code.${appearance}`); await flush();
      assert.equal(s.cm(), view);
      const label = view.dom.querySelector('.cm-preview-code-language');
      assert.equal(label.textContent, 'js');
      assert.equal(s.dom.window.getComputedStyle(label).color, appearance === 'light' ? 'rgb(85, 85, 85)' : 'rgb(170, 170, 170)');
      assert.equal(view.dom.querySelectorAll('.cm-preview-code-block').length, 3);
      assert.equal(s.target.querySelector('.lm-text-editor').style.backgroundColor, '');
      assert.equal(view.state.sliceDoc(), original);
    }
    const info = view.state.doc.line(3).from + 3;
    view.dispatch({ changes: { from: info, to: info + 2, insert: 'typescript' }, selection: { anchor: 0 } });
    assert.equal(view.dom.querySelector('.cm-preview-code-language').textContent, 'typescript');
    await s.documents.open({ vaultId: 'a', path: 'note.md' }); await flush();
    assert.equal(s.disk.get('a/note.md').text, original.replace('```js', '```typescript'));
    assert.equal(undo(view), true);
    assert.equal(view.state.sliceDoc(), original);
  } finally { await s.stop(); }
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

test('Workspace preserves Tab traversal outside editable content', async () => {
  const s = await setup({ withLayout: true }); const view = s.cm();
  const button = s.dom.window.document.createElement('button');
  s.dom.window.document.body.append(button); button.focus();
  const event = new s.dom.window.KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, bubbles: true, cancelable: true });
  button.dispatchEvent(event); await flush();
  assert.equal(event.defaultPrevented, false);
  assert.equal(view.state.doc.toString(), '# Note');
  button.remove(); await s.stop();
});

test('Tab nests bullet, ordered and task items from the text and Enter continues the nested list', async () => {
  for (const [first, second, continuation] of [
    ['- Parent', '- Child', '- '], ['1. Parent', '2. Child', '3. '], ['- [ ] Parent', '- [ ] Child', '- [ ] '],
  ]) {
    const original = `${first}\n${second}`;
    const s = await setup({ initial: original, withLayout: true }); const view = s.cm(); view.focus();
    const press = (key, keyCode, shiftKey = false) => {
      const event = new s.dom.window.KeyboardEvent('keydown', { key, keyCode, shiftKey, bubbles: true, cancelable: true });
      view.contentDOM.dispatchEvent(event); assert.equal(event.defaultPrevented, true);
    };
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    press('Tab', 9); await flush();
    assert.equal(view.state.doc.toString(), `${first}\n\t${second}`);
    let listDepth = 0;
    for (let node = syntaxTree(view.state).resolveInner(view.state.selection.main.head, -1); node; node = node.parent)
      if (['BulletList', 'OrderedList'].includes(node.name)) listDepth++;
    assert.equal(listDepth, 2);
    press('Tab', 9, true); await flush();
    assert.equal(view.state.doc.toString(), original);
    press('Tab', 9); await flush();
    press('Enter', 13); await flush();
    assert.equal(view.state.doc.line(3).text.trimStart(), continuation);
    assert.match(view.state.doc.line(3).text, /^\t/);
    await s.documents.open({ vaultId: 'a', path: 'note.md' }); await flush();
    assert.ok(s.disk.get('a/note.md').text.includes(`\n\t${second}`));
    await s.stop();
  }
});

test('repeated hard tabs retain standalone and nested lists and Shift-Tab reverses every level', async () => {
  for (const [prefix, item] of [['Text\n\n', '- Example'], ['- Parent\n', '- Child'], ['1. Parent\n', '2. Child'], ['- [ ] Parent\n', '- [ ] Child']]) {
    const s = await setup({ initial: prefix + item, withLayout: true }); const view = s.cm(); view.focus();
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    const press = (key, keyCode, shiftKey = false) => view.contentDOM.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', {
      key, keyCode, shiftKey, bubbles: true, cancelable: true,
    }));
    for (let depth = 1; depth <= 4; depth++) {
      press('Tab', 9); await flush();
      assert.equal(view.state.doc.toString(), prefix + '\t'.repeat(depth) + item);
      assert.ok(!syntaxTree(view.state).toString().includes('CodeBlock'));
      assert.ok(syntaxTree(view.state).toString().includes('ListItem'));
      assert.equal(view.dom.querySelector('.cm-preview-code-block'), null);
    }
    await s.documents.open({ vaultId: 'a', path: 'note.md' }); await flush();
    assert.equal(s.disk.get('a/note.md').text, prefix + '\t'.repeat(4) + item);
    press('Enter', 13); await flush();
    assert.ok(view.state.doc.line(view.state.doc.lines).text.startsWith('\t'.repeat(4)), view.state.doc.toString());
    undo(view); await flush();
    for (let depth = 3; depth >= 0; depth--) {
      press('Tab', 9, true); await flush();
      assert.equal(view.state.doc.toString(), prefix + '\t'.repeat(depth) + item);
    }
    await s.stop();
  }
});

test('public statistics follow unsaved Unicode input, document changes and closure', async () => {
 const s = await setup({ initial: 'Привет мир' });
 try {
  assert.equal(s.statistics.current().words, 2); assert.equal(s.statistics.current().letters, 9);
  const changes = []; s.ctx.events.on(DocumentStatisticsChanged, value => changes.push(value.current));
  s.edit('Hello, ёж! 123 👩‍💻'); await flush();
  assert.equal(s.statistics.current().words, 3); assert.equal(s.statistics.current().letters, 7);
  assert.equal(s.disk.get('a/note.md').text, 'Привет мир'); assert.ok(changes.some(v => v?.letters === 7));
  await s.documents.open({ vaultId: 'a', path: 'other.md' }); await flush(); assert.equal(s.statistics.current().letters, 5);
  await s.documents.open({ vaultId: 'a', path: 'image.png' }); await flush(); assert.equal(s.statistics.current().state, 'unavailable'); assert.equal(s.statistics.current().words, null);
  await s.documents.close(); await flush(); assert.equal(s.statistics.current(), null);
 } finally { await s.stop(); }
});

async function editorMenu(s) {
 const view=s.cm();view.posAtCoords=()=>null;
 view.dom.dispatchEvent(new s.dom.window.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:20,clientY:20}));await flush();
 return label => s.dom.window.document.querySelector('[role=menuitem][aria-label="'+label+'"]');
}
test('editor island formats the invocation selection, opens headings and preserves undo',async()=>{
 const s=await setup({initial:'Hello world'});try{
  s.cm().dispatch({selection:{anchor:0,head:5}});let item=await editorMenu(s);
  const island=s.dom.window.document.querySelector('.lm-context-island');assert.ok(island);assert.equal(item('Bold').textContent,'');assert.ok(item('Cut'));assert.ok(item('Copy'));assert.ok(item('Paste'));assert.ok(item('Select all'));
  s.cm().dispatch({effects:StateEffect.define().of(true)});item('Bold').click();await flush();assert.equal(s.cm().state.sliceDoc(),'**Hello** world');assert.equal(undo(s.cm()),true);assert.equal(s.cm().state.sliceDoc(),'Hello world');
  item=await editorMenu(s);item('Heading').focus();item('Heading').dispatchEvent(new s.dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));await flush();assert.ok(item('Heading 3'));item('Heading 3').click();await flush();assert.equal(s.cm().state.sliceDoc(),'### Hello world');
 }finally{await s.stop();}
});
test('editor cut/copy/paste use the SDK and select-all keeps the document unchanged',async()=>{
 const s=await setup({initial:'Hello world',clipboardText:'NEW'});try{
  s.cm().dispatch({selection:{anchor:0,head:5}});let item=await editorMenu(s);item('Copy').click();await flush();assert.deepEqual(s.clipboardCalls.at(-1),['write','Hello']);assert.equal(s.cm().state.sliceDoc(),'Hello world');
  item=await editorMenu(s);item('Cut').click();await flush();assert.equal(s.cm().state.sliceDoc(),' world');
  item=await editorMenu(s);item('Paste').click();await flush();assert.equal(s.cm().state.sliceDoc(),'NEW world');
  item=await editorMenu(s);item('Select all').click();await flush();assert.equal(s.cm().state.selection.main.from,0);assert.equal(s.cm().state.selection.main.to,9);
 }finally{await s.stop();}
});
test('denied clipboard cannot remove selected text and switching documents cancels an awaited paste',async()=>{
 const s=await setup({initial:'Hello',clipboardFailure:true});try{s.cm().dispatch({selection:{anchor:0,head:5}});const item=await editorMenu(s);item('Cut').click();await flush();assert.equal(s.cm().state.sliceDoc(),'Hello');assert.ok(s.target.querySelector('[role=alert]').textContent.includes('Clipboard'));}finally{await s.stop();}
 let release;const delayed=await setup({initial:'Original',readClipboard:()=>new Promise(resolve=>{release=resolve})});try{const item=await editorMenu(delayed);item('Paste').click();await flush();await delayed.documents.open({vaultId:'a',path:'other.md'});await flush();release(ok('WRONG'));await flush();assert.equal(delayed.cm().state.sliceDoc(),'Other');}finally{await delayed.stop();}
});

test('keyboard context menu exposes icon names, horizontal movement and closes on selection changes',async()=>{
 const s=await setup({initial:'Keyboard'});try{
  s.cm().coordsAtPos=()=>({left:10,right:10,top:10,bottom:25});s.cm().dom.dispatchEvent(new s.dom.window.KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true}));await flush();await new Promise(resolve=>setTimeout(resolve,25));
  const doc=s.dom.window.document;const bold=doc.querySelector('[role=menuitem][aria-label=Bold]');assert.ok(bold);bold.focus();assert.equal(doc.activeElement === bold,true);assert.equal(bold.parentElement.querySelectorAll(':scope > [role=menuitem]').length,6);bold.dispatchEvent(new s.dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));assert.equal(doc.activeElement.getAttribute('aria-label'),'Italic','Immediately after arrow: '+doc.activeElement.tagName);await flush();assert.equal(doc.activeElement.getAttribute('aria-label'),'Italic');
  s.cm().dispatch({selection:{anchor:2}});await flush();assert.equal(doc.querySelector('[data-lunaris-context-menu]'),null);
 }finally{await s.stop();}
});

test('Lists menu inserts a task that uses the existing interactive checkbox renderer',async()=>{
 const s=await setup({initial:'Todo\n'});try{
  s.cm().dispatch({selection:{anchor:0}});const item=await editorMenu(s);item('Lists').focus();item('Lists').dispatchEvent(new s.dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));await flush();
  assert.ok(item('Task list'));assert.ok(item('Task list').querySelector('svg'));item('Task list').click();await flush();assert.equal(s.cm().state.sliceDoc(),'- [ ] Todo\n');
  s.cm().dispatch({selection:{anchor:s.cm().state.doc.length}});await flush();const checkbox=s.target.querySelector('input[type=checkbox]');assert.ok(checkbox);checkbox.click();await flush();assert.equal(s.cm().state.sliceDoc(),'- [x] Todo\n');
 }finally{await s.stop();}
});

test('editor writer identities remain distinct across independent kernels with matching activation sequences',async()=>{
 const records=[];const drafts={list:async()=>ok([]),load:async()=>ok(null),save:async record=>{records.push(record);return ok(null);},remove:async()=>ok(null)};
 for(let i=0;i<2;i++){const s=await setup({drafts});s.cm().dispatch({changes:{from:0,to:s.cm().state.doc.length,insert:'Writer '+i}});await flush();assert.ok(records.length>i,JSON.stringify(s.kernel.diagnostics()));await s.stop();}
 assert.ok(records.length>=2);assert.notEqual(records[0].key.writerId,records.at(-1).key.writerId);
});

test('editor title renames the open document on disk and relocates the active buffer',async()=>{
 const s=await setup();
 try{
  await flush();
  const titleInput=s.target.querySelector('.lm-editor-title input');
  assert.ok(titleInput,s.target.textContent);
  assert.equal(titleInput.value,'note');assert.equal(titleInput.disabled,false);
  typeInput(titleInput,'renamed');await flush();
  titleInput.dispatchEvent(new s.dom.window.FocusEvent('focusout',{bubbles:true}));
  await flush();await flush();
  const move=s.calls.find(call=>call[0]==='move');
  assert.ok(move,JSON.stringify(s.calls));
  assert.equal(move[1].path,'note.md');assert.equal(move[2].path,'renamed.md');
  assert.equal(s.disk.has('a/note.md'),false);assert.equal(s.disk.has('a/renamed.md'),true);
  assert.deepEqual(s.documents.current(),{vaultId:'a',path:'renamed.md'});
  assert.equal(s.target.querySelector('.lm-editor-title input').value,'renamed');
 }finally{await s.stop();}
});

test('editor title rejects empty names and path separators without moving the file',async()=>{
 const s=await setup();
 try{
  await flush();
  const titleInput=s.target.querySelector('.lm-editor-title input');
  for(const invalid of ['','  ','sub/name']){
   typeInput(titleInput,invalid);await flush();
   titleInput.dispatchEvent(new s.dom.window.FocusEvent('focusout',{bubbles:true}));await flush();await flush();
   assert.equal(s.calls.some(call=>call[0]==='move'),false,invalid);
   assert.equal(s.disk.has('a/note.md'),true);
  }
  assert.equal(s.target.querySelector('.lm-editor-title input').value,'note');
 }finally{await s.stop();}
});

