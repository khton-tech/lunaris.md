import callouts from "@lunaris/callouts";
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { useBrowser } from '../../../../tools/test/browser.mjs';
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
  for (const plugin of [settingsProvider, menuProvider, filesystem, vault, documents, screenProvider, screenHost, components, themes, localization, mantine, editor, callouts, closeGuard.plugin]) kernel.register(plugin);

  kernel.register(definePlugin({ manifest: metadata('test.consumer', [], [Settings, DocumentStatistics, DocumentStatisticsChanged, Filesystem, Vault, ActiveDocument, ActiveScreen, Components, Themes, Localization].map(t => ({ kind: t.kind, id: t.id, range: '^' + t.version })), ['vault.access', 'filesystem.access', 'ui.dom']), activate(ctx) {
    api = { ctx, settings: ctx.use(Settings), statistics: ctx.use(DocumentStatistics), fs: ctx.use(Filesystem), vault: ctx.use(Vault), documents: ctx.use(ActiveDocument), screens: ctx.use(ActiveScreen), components: ctx.use(Components), themes: ctx.use(Themes), language: ctx.use(Localization) };
  } }));
  for (const [id, grants] of Object.entries({ 'test.driver': ['filesystem.native'], 'lunaris.filesystem-provider': ['filesystem.access', 'filesystem.app-config'], 'lunaris.vault-manager': ['filesystem.access'], 'lunaris.active-document-provider': ['vault.access', 'config.access', 'filesystem.access'], 'lunaris.active-screen-provider': ['vault.access'], [screenHost.manifest.id]: ['ui.dom'], 'lunaris.component-provider': ['ui.dom'], 'lunaris.mantine-components': ['ui.dom'], 'lunaris.context-menu-provider': ['ui.dom'], 'lunaris.text-editor': ['clipboard.access', 'ui.dom', 'vault.access', 'filesystem.access'], 'test.consumer': ['vault.access', 'filesystem.access', 'ui.dom'] })) for (const grant of grants) kernel.grant(id, grant);
  kernel.grant(closeGuard.plugin.manifest.id, 'vault.access');
  kernel.grant(editor.manifest.id, 'config.access'); kernel.grant(callouts.manifest.id, 'ui.dom');
  await kernel.start('test.consumer'); await kernel.start(mantine.manifest.id); await kernel.start(screenHost.manifest.id); await kernel.start(editor.manifest.id); await kernel.start(callouts.manifest.id); await kernel.start(closeGuard.plugin.manifest.id);
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

test('callouts compose inside Workspace, fold without saving, localize and unload through the SDK', async () => {
  const source='Start\n\n> [!warning]- A warning\n> Body **bold**\n>\n> > [!tip]+ Nested\n> > Nested body\n\nEnd';
  const s=await setup({initial:source,withLayout:true});
  try {
    const baselineLogCount=s.logs.length;
    const view=s.cm();
    const title=()=>s.target.querySelector('.lm-callout-title');
    const toggle=()=>s.target.querySelector('[aria-expanded]');
    assert.ok(title(),s.target.textContent);assert.equal(toggle().getAttribute('aria-expanded'),'false');
    assert.equal(s.calls.filter(x=>x[0]==='write').length,0);
    const focused=toggle();focused.focus();focused.click();await flush();assert.equal(toggle().getAttribute('aria-expanded'),'true');
    assert.equal(s.dom.window.document.activeElement,focused);assert.equal(toggle(),focused);
    assert.ok(s.target.textContent.includes('Nested'));
    assert.equal(view.state.sliceDoc(),source);assert.equal(s.cm(),view);
    s.language.setLocale('ru');await flush();assert.ok(title().getAttribute('aria-label').startsWith('Изменить'));
    s.themes.register({id:'test.callouts.light',name:'Light',properties:{appearance:'light',colors:{text:'#111111',background:'#ffffff',accent:'#0055aa',error:'#bb0000'}}},s.ctx.signal);
    s.themes.select('test.callouts.light');await flush();assert.equal(s.cm(),view);assert.equal(toggle().getAttribute('aria-expanded'),'true');
    const header=title();header.click();await flush();assert.ok(view.state.selection.main.head>source.indexOf('[!warning]'));
    assert.ok(s.target.textContent.includes('[!warning]- A warning'));
    view.dispatch({selection:{anchor:0}});await flush();
    await s.kernel.stop(callouts.manifest.id);await flush();
    assert.equal(s.target.querySelector('.lm-callout-title'),null);assert.equal(s.cm().state.sliceDoc(),source);
    assert.equal(s.calls.filter(x=>x[0]==='write').length,0);
    assert.ok(!s.logs.slice(baselineLogCount).some(x=>x[0]==='error'),JSON.stringify(s.logs.slice(baselineLogCount).filter(x=>x[0]==='error')));
  } finally { await s.stop(); }
});

test('callout role replacement retains source and reattaches live headers',async()=>{
  const source='Start\n\n> [!note]+ Title\n> Body';const s=await setup({initial:source});
  try {
    assert.ok(s.target.querySelector('.lm-callout-title'));
    await s.kernel.stop(mantine.manifest.id);await flush();
    await s.kernel.start(mantine.manifest.id);await flush();
    assert.equal(s.cm().state.sliceDoc(),source);assert.ok(s.target.querySelector('.lm-callout-title'));
  } finally { await s.stop(); }
});

test('real Enter command continues tasks inside callouts and saves CRLF through the editor',async()=>{
  const source='Start\r\n\r\n> [!todo] Tasks\r\n> - [x] One';const s=await setup({initial:source,withLayout:true});
  try {
    const view=s.cm();view.dispatch({selection:{anchor:view.state.doc.length}});
    view.contentDOM.dispatchEvent(new s.dom.window.KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,bubbles:true,cancelable:true}));
    await flush();assert.equal(view.state.sliceDoc(),source+'\r\n> - [ ] ');
    view.contentDOM.dispatchEvent(new s.dom.window.KeyboardEvent('keydown',{key:'s',code:'KeyS',keyCode:83,ctrlKey:true,bubbles:true,cancelable:true}));
    await flush();assert.equal(s.disk.get('a/note.md').text,source+'\r\n> - [ ] ');
    assert.equal(s.cm(),view);assert.equal(undo(view),true);assert.equal(view.state.sliceDoc(),source);
  } finally { await s.stop(); }
});

test('callout card matches code-block boundaries and keeps normal body typography inside Workspace',async()=>{
 const source='Start\n\n> [!note] A title\n> Body\n> Last line\n\n```\nCode\n```\n\nEnd';const s=await setup({initial:source,withLayout:true});
 try {
  const view=s.cm(),header=s.target.querySelector('.cm-callout-start'),end=s.target.querySelector('.cm-callout-end'),body=[...s.target.querySelectorAll('.cm-callout')].find(line=>line.textContent==='Body');
  const codeStart=s.target.querySelector('.cm-preview-code-start'),codeEnd=s.target.querySelector('.cm-preview-code-end');
  assert.ok(header);assert.ok(end);assert.ok(body);assert.notEqual(header,end);
  const style=node=>s.dom.window.getComputedStyle(node);
  assert.equal(style(header).borderTopLeftRadius,style(codeStart).borderTopLeftRadius);assert.ok(parseFloat(style(header).borderTopLeftRadius)>0);
  assert.equal(style(end).borderBottomRightRadius,style(codeEnd).borderBottomRightRadius);
  assert.equal(style(body).fontWeight,style(view.contentDOM).fontWeight);
  assert.equal(view.state.sliceDoc(),source);assert.equal(s.calls.filter(x=>x[0]==='write').length,0);
  s.edit('Start\n\n> [!note]- Folded\n> Body');view.dispatch({selection:{anchor:0}});await flush();
  const folded=s.target.querySelector('.cm-callout-start');assert.equal(folded.classList.contains('cm-callout-end'),true);
 } finally { await s.stop(); }
});
