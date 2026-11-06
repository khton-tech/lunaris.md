import { useBrowser, typeInput } from '../../../../tools/test/browser.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createKernel } from '@lunaris/kernel';
import { definePlugin } from '@lunaris/sdk';
import { TestScheduler } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Components } from '@lunaris/components';
import { Themes } from '@lunaris/themes';
import componentProvider from '@lunaris/component-provider';
import themeProvider from '@lunaris/theme-provider';
import plugin from '@lunaris/mantine-components';
import contextMenuProvider from '@lunaris/context-menu-provider';
import { ContextMenu } from '@lunaris/context-menu';

const manifest = (id, provides = [], requires = [], permissions = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides, requires, permissions, optionalPermissions: [] });
async function setup() {
  const dom = useBrowser(new JSDOM('<div id="target"><span>Sibling</span></div>'));
  const target = dom.window.document.getElementById('target'); const logs = [];
  let components; let themes; let ctx; let menus;
  const logger = definePlugin({ manifest: manifest('test.logger', [{ kind: 'api', id: Logger.id, version: Logger.version }]), activate(context) {
    context.provide(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, (...args) => { logs.push([level, ...args]); return true; }])));
  } });
  const consumer = definePlugin({ manifest: manifest('test.consumer', [], [Components, Themes, ContextMenu].map(token => ({ kind: 'api', id: token.id, range: '^1.0.0' })), ['ui.dom']), activate(context) {
    ctx = context; components = ctx.use(Components); themes = ctx.use(Themes); menus = ctx.use(ContextMenu);
  } });
  const kernel = createKernel({ scheduler: new TestScheduler() });
  for (const item of [logger, componentProvider, themeProvider, contextMenuProvider, plugin, consumer]) kernel.register(item);
  for (const id of [componentProvider.manifest.id, contextMenuProvider.manifest.id, plugin.manifest.id, consumer.manifest.id]) kernel.grant(id, 'ui.dom');
  await kernel.start(consumer.manifest.id);
  return { dom, target, logs, kernel, components, themes, menus, ctx, async start() { await kernel.start(plugin.manifest.id); }, async stop() {
    await kernel.stopAll(); assert.ok(!kernel.inspect().diagnostics.some(item => item.code === 'CLEANUP_FAILED')); assert.equal(target.textContent, 'Sibling'); dom.window.close();
  } };
}
const startup = { art: '<img src=x> ASCII', logoLabel: 'Lunaris', status: 'Loading' };
const selector = {
  art: 'ASCII', text: { logo: 'Lunaris', recent: 'Recent', empty: 'Empty', create: 'Create', select: 'Select', folder: 'Folder', folderPlaceholder: 'Choose folder', browse: 'Browse', name: 'Name', next: 'Next', retry: 'Retry' },
  mode: 'create', folder: 'Notes', name: 'Draft', busy: false, canContinue: true, error: '', historyError: '', status: '',
  entries: [{ reference: 'saved', name: '<img src=x>', label: 'Folder' }],
  onMode() {}, onName() {}, onBrowse() {}, onNext() {}, onRecent() {}, onRetry() {},
};

test('workspace header retains intrinsic block sizing while full-height surfaces retain size containment', async () => {
  const s = await setup(); await s.start();
  const props = { name: 'A long Vault name that can wrap', closeLabel: 'Close vault', busy: false, error: '', onClose() {} };
  const header = s.components.mount('lunaris.workspace-header', s.target, props, s.ctx.signal); assert.equal(header.ok, true);
  const root = s.target.querySelector('header').closest('.lm-root');
  assert.equal(root.style.containerType, 'inline-size'); assert.equal(root.style.flexBasis, 'auto'); assert.equal(root.style.height, '');
  header.value.update({ ...props, error: 'Could not close this vault. Try again.' });
  assert.equal(s.target.querySelector('header').closest('.lm-root'), root); assert.equal(s.target.querySelector('[role=alert]').hidden, false);
  s.components.mount('lunaris.startup-screen', s.target, startup, s.ctx.signal);
  assert.equal(s.target.querySelector('.lm-startup').closest('.lm-root').style.containerType, 'size'); await s.stop();
});

test('registers the replaceable roles, renders real Mantine controls, preserves siblings and releases roots', async () => {
  const s = await setup(); await s.start();
  assert.deepEqual(s.components.list(), ['lunaris.context-menu', 'lunaris.file-explorer', 'lunaris.sidebar-rail', 'lunaris.startup-screen', 'lunaris.vault-selector', 'lunaris.workspace-empty', 'lunaris.workspace-header', 'lunaris.workspace-layout']);
  const owner = s.ctx.scope.child();
  const mounted = s.components.mount('lunaris.vault-selector', s.target, selector, owner.signal); assert.equal(mounted.ok, true);
  assert.ok(s.target.querySelector('.mantine-Button-root')); assert.ok(s.target.querySelector('.mantine-TextInput-input'));
  assert.equal(s.target.querySelector('img'), null); assert.equal(s.target.firstElementChild.textContent, 'Sibling');
  assert.ok(s.logs.some(log => log[0] === 'info' && log[1] === plugin.manifest.id && log[3]?.code === 'MANTINE_COMPONENTS_READY'));
  await owner.dispose(); assert.equal(s.target.querySelector('.lm-root'), null); await s.stop();
});

test('theme replacement and clearing update mounted roots without affecting the document or stored preferences', async () => {
  const s = await setup(); await s.start();
  assert.equal(s.components.mount('lunaris.startup-screen', s.target, startup, s.ctx.signal).ok, true);
  assert.equal(s.components.mount('lunaris.vault-selector', s.target, selector, s.ctx.signal).ok, true);
  const input = s.target.querySelector('input'); const roots = [...s.target.querySelectorAll('.lm-root')];
  const theme = { id: 'test.theme', name: 'Custom', properties: { appearance: 'light', colors: { background: '#ffffff', text: '#202020', caret: '#234567', error: '#ff0000' }, geometry: { radius: { medium: 12 } }, typography: { fontFamily: ['Arial', 'sans-serif'], fontSize: 16 } } };
  s.themes.register(theme, s.ctx.signal); s.themes.select(theme.id);
  assert.equal(s.target.querySelector('section').style.backgroundColor, 'rgb(255, 255, 255)');
  assert.equal(s.target.querySelector('.ln-vault').style.getPropertyValue('--vault-caret'), '#234567');
  assert.equal(s.target.querySelector('input'), input); assert.equal(input.value, 'Draft');
  for (const root of roots) {
    assert.equal(root.dataset.mantineColorScheme, 'light');
    assert.ok([...root.querySelectorAll('style')].some(style => style.textContent.includes(`#${root.id}`)));
    assert.ok([...root.querySelectorAll('style')].some(style => /--mantine-color-text:\s*#202020/.test(style.textContent)));
  }
  assert.equal(s.dom.window.document.documentElement.hasAttribute('data-mantine-color-scheme'), false);
  assert.equal(s.dom.window.localStorage.length, 0);
  s.themes.select(null);
  assert.equal(s.target.querySelector('.ln-vault').style.getPropertyValue('--vault-caret'), 'currentColor');
  assert.equal(s.target.querySelector('section').style.backgroundColor, 'transparent');
  await s.stop();
});

test('prop validation preserves prior content, editable nodes, safe copy and focus during localized updates', async () => {
  const s = await setup(); await s.start(); let draft;
  const props = { ...selector, onName: value => { draft = value; } };
  const result = s.components.mount('lunaris.vault-selector', s.target, props, s.ctx.signal); assert.equal(result.ok, true);
  const input = s.target.querySelector('input'); input.focus(); typeInput(input, 'Typed'); assert.equal(draft, 'Typed');
  assert.equal(result.value.update({ ...props, name: 'Typed', text: { ...props.text, name: 'Nom' } }).ok, true);
  assert.equal(s.target.querySelector('input'), input); assert.equal(input.value, 'Typed'); assert.equal(s.dom.window.document.activeElement, input);
  assert.equal(result.value.update({ ...props, onNext: null }).ok, false); assert.equal(input.value, 'Typed');
  assert.equal(s.components.mount('lunaris.startup-screen', s.target, { status: 5 }, s.ctx.signal).ok, false);
  await s.stop();
});

test('folder picker uses one native button, shares input sizing and keeps primary actions on the SDK palette', async () => {
  const s = await setup(); await s.start(); let browsed = 0; let submitted = 0;
  const theme = { id: 'test.controls', name: 'Controls', properties: { colors: { accent: '#abcdef', accentHover: '#fedcba', onAccent: '#123456' } } };
  s.themes.register(theme, s.ctx.signal); s.themes.select(theme.id);
  const props = { ...selector, onBrowse() { browsed++; }, onNext() { submitted++; } };
  const result = s.components.mount('lunaris.vault-selector', s.target, props, s.ctx.signal); assert.equal(result.ok, true);
  const form = s.target.querySelector('form:not([inert])');
  const picker = form.querySelector('button[aria-label=Browse]'); const input = form.querySelector('input');
  assert.equal(picker.type, 'button'); assert.equal(picker.id, form.querySelector('label').htmlFor);
  assert.equal(picker.closest('.mantine-Input-wrapper').dataset.size, 'md');
  assert.equal(input.closest('.mantine-Input-wrapper').dataset.size, 'md');
  assert.equal(form.querySelectorAll('[aria-label=Browse]').length, 1);
  picker.querySelector('.ln-vault-path').click(); assert.equal(browsed, 1); assert.equal(submitted, 0);
  const next = form.querySelector('[type=submit]');
  assert.equal(next.dataset.variant, 'filled'); assert.equal(next.style.getPropertyValue('--button-bg'), '#abcdef');
  assert.equal(next.style.getPropertyValue('--button-color'), '#123456');
  result.value.update({ ...props, busy: true }); picker.click(); next.click();
  assert.equal(browsed, 1); assert.equal(submitted, 0); assert.equal(input.disabled, true);
  result.value.update(props); next.click(); assert.equal(submitted, 1);
  s.themes.update({ ...theme, properties: { colors: { accent: '#112233', onAccent: '#ffffff' } } });
  assert.equal(form.querySelector('[type=submit]'), next);
  assert.equal(next.style.getPropertyValue('--button-bg'), '#112233');
  await s.stop();
});

test('keyboard disclosure, collapse, current rows and separate roots preserve accessible behavior', async () => {
  const s = await setup(); await s.start();
  const result = s.components.mount('lunaris.vault-selector', s.target, { ...selector, activeReference: 'saved' }, s.ctx.signal);
  assert.equal(result.ok, true); const input = s.target.querySelector('input'); input.focus();
  assert.equal(s.target.querySelector('[aria-current=true]').dataset.reference, 'saved');
  result.value.update({ ...selector, mode: null });
  assert.equal(s.dom.window.document.activeElement, s.target.querySelector('.ln-vault-toggle'));
  assert.equal(input.closest('form').hasAttribute('inert'), true);
  assert.equal(input.closest('.ln-vault-disclosure').getAttribute('aria-hidden'), 'true');
  result.value.dispose(); result.value.dispose(); await s.stop();
});

test('collision rolls back prior role registration, then restart succeeds and closes all roots', async () => {
  const s = await setup(); const owner = s.ctx.scope.child();
  s.components.register({ id: 'lunaris.vault-selector', mount() { return { update() {}, dispose() {} }; } }, owner.signal);
  await assert.rejects(s.start()); assert.equal(s.components.has('lunaris.startup-screen'), false);
  assert.ok(s.logs.some(log => log[3]?.code === 'MANTINE_REGISTRATION_FAILED' && log[3].error.cause.code === 'ALREADY_REGISTERED'));
  await owner.dispose(); await s.start();
  assert.equal(s.components.mount('lunaris.startup-screen', s.target, startup, s.ctx.signal).ok, true);
  await s.kernel.stop(plugin.manifest.id); assert.equal(s.target.textContent, 'Sibling');
  await s.start(); assert.equal(s.components.has('lunaris.startup-screen'), true); await s.stop();
});


const settle = () => new Promise(resolve => setTimeout(resolve, 25));
test('shared context menu opens nested folders by keyboard, executes once and restores source focus', async () => {
  const s = await setup(); await s.start();
  s.themes.register({ id: 'test.menu-theme', name: 'Menu theme', properties: { colors: { background: '#123456' } } }, s.ctx.signal); s.themes.select('test.menu-theme');
  const source = s.dom.window.document.createElement('button'); source.textContent = 'Source'; s.target.append(source);
  const calls = [];
  s.menus.register({ id: 'test.tools', build: context => [{ kind: 'group', id: 'test.group', label: 'Tools', children: [
    { kind: 'group', id: 'test.nested', label: 'Nested', children: [{ kind: 'action', id: 'test.run', label: 'Inspect', run: invocation => { calls.push(invocation); } }] },
  ] }] }, s.ctx.signal);
  const context = { source: 'lunaris.file-explorer', target: 'file', data: { path: 'a.md' } };
  const opened = s.menus.open({ target: source, x: 15, y: 25, label: 'File actions', context }, s.ctx.signal); assert.equal(opened.ok, true); await settle();
  const doc = s.dom.window.document;
  assert.equal(doc.querySelector('.lm-context-surface').style.backgroundColor, 'transparent');
  const item = label => [...doc.querySelectorAll('[role=menuitem]')].find(node => node.textContent === label);
  item('Tools').focus(); item('Tools').dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); await settle();
  assert.ok(item('Nested'));
  item('Nested').focus(); item('Nested').dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); await settle();
  assert.ok(item('Inspect')); item('Inspect').click(); await settle();
  assert.equal(calls.length, 1); assert.equal(calls[0].data.path, 'a.md'); assert.equal(doc.querySelector('[data-lunaris-context-menu]'), null); assert.equal(doc.activeElement, source);
  assert.equal((await opened.value.execute('test.run')).ok, false);
  s.menus.open({ target: source, x: 15, y: 25, label: 'File actions', context }, s.ctx.signal); await settle();
  doc.querySelector('[role=menu]').dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await settle();
  assert.equal(doc.querySelector('[data-lunaris-context-menu]'), null); assert.equal(doc.activeElement, source);
  source.remove(); await s.stop();
});
function explorerFixture(overrides = {}) {
  return { vaultId: 'a', workspace: { vaultId: 'a' }, data: [{ id: 'folder', name: 'Folder', kind: 'directory', children: [{ id: 'folder/note.md', name: 'note.md', kind: 'file' }] }, { id: 'a.md', name: '<img src=x>.md', kind: 'file' }],
    expanded: ['folder'], selection: [], busy: false, loading: false, error: '', degraded: '', canPaste: false,
    text: { tabs: 'Tabs', title: 'Files', newFile: 'New file', newFolder: 'New folder', rename: 'Rename', copy: 'Copy', cut: 'Cut', paste: 'Paste', remove: 'Delete', refresh: 'Refresh', actions: 'Actions', name: 'Name', create: 'Create', cancel: 'Cancel', empty: 'No files', loading: 'Loading', root: 'Vault root', retry: 'Retry', confirmDelete: 'Delete permanently?', deleteWarning: 'No trash or undo' },
    initialDraft: { form: null, name: '' }, onContextMenu() {}, onDraft() {}, onToggle() {}, onSelection() {}, onBuffer() {}, onCreate: async () => true, onRename: async () => true, onMove: async () => true, onPaste: async () => true, onRemove: async () => true, onRefresh() {}, ...overrides };
}

test('right-click preserves invocation multi-selection, coordinates and safe root/background commands', async () => {
  const s = await setup(); await s.start(); const contexts = []; const buffered = [];
  s.dom.window.HTMLElement.prototype.getBoundingClientRect = () => new s.dom.window.DOMRect(0, 0, 320, 320);
  const props = explorerFixture({ selection: ['folder', 'a.md'], onContextMenu: request => { contexts.push(request); }, onBuffer: (...args) => buffered.push(args) });
  s.components.mount('lunaris.file-explorer', s.target, props, s.ctx.signal); await settle();
  const rightClick = node => node.dispatchEvent(new s.dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 75, clientY: 95 }));
  rightClick(s.target.querySelector('[title="a.md"]')); await settle();
  assert.deepEqual(contexts[0].selection, ['folder', 'a.md']); assert.equal(contexts[0].path, 'a.md'); assert.equal(contexts[0].kind, 'file');
  assert.equal(contexts[0].x, 75); assert.equal(contexts[0].y, 95);
  contexts[0].entries.find(item => item.id.endsWith('.copy')).run({}); assert.deepEqual(buffered, [[['folder', 'a.md'], false]]);
  rightClick(s.target.querySelector('[data-root]')); await settle();
  assert.equal(contexts[1].kind, 'root'); assert.equal(contexts[1].path, ''); assert.deepEqual(contexts[1].selection, []);
  assert.equal(contexts[1].entries.find(item => item.id.endsWith('.remove')).disabled, true);
  rightClick(s.target.querySelector('.lm-explorer-tree')); await settle();
  assert.equal(contexts[2].kind, 'background'); assert.equal(contexts[2].path, null); assert.equal(contexts[2].destination, '');
  await s.stop();
});
test('Arborist renders a virtualized, escaped tree and preserves owned roots across theme/props updates', async () => {
  const s = await setup(); await s.start();
  const props = explorerFixture({ data: Array.from({ length: 10000 }, (_, i) => ({ id: 'file-' + i, name: '<img src=x>' + i, kind: 'file' })) });
  const owner = s.ctx.scope.child();
  const result = s.components.mount('lunaris.file-explorer', s.target, props, owner.signal); assert.equal(result.ok, true, s.logs.map(log => log[3]?.error?.stack).filter(Boolean).join('\n'));
  await settle();
  assert.equal(s.target.querySelector('[role=tree]').getAttribute('aria-multiselectable'), 'true');
  assert.ok(s.target.querySelectorAll('[role=treeitem]').length < 100); assert.ok(s.target.querySelectorAll('[role=treeitem]').length > 0);
  assert.equal(s.target.querySelector('img'), null);
  const root = s.target.querySelector('.lm-root');
  result.value.update({ ...props, error: 'Cannot move' }); await settle();
  assert.equal(s.target.querySelector('.lm-root'), root); assert.equal(s.target.querySelector('[role=alert]').textContent, 'Cannot move');
  assert.equal(result.value.update({ ...props, data: [{ id: 'bad', kind: 'directory' }] }).ok, false);
  await owner.dispose(); assert.equal(s.target.querySelector('[role=tree]'), null); await s.stop();
});

test('explorer create form uses Mantine, preserves drafts and confirms permanent deletion before calling controller', async () => {
  const s = await setup(); await s.start(); const calls = [];
  const props = explorerFixture({ onCreate: async (...args) => { calls.push(['create', ...args]); return true; }, onRemove: async paths => { calls.push(['remove', paths]); return true; } });
  const result = s.components.mount('lunaris.file-explorer', s.target, props, s.ctx.signal); assert.equal(result.ok, true, s.logs.map(log => log[3]?.error?.stack).filter(Boolean).join('\n'));
  s.target.querySelector('[role=tree]').dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true, cancelable: true })); await settle();
  const input = s.target.querySelector('input'); assert.ok(input.classList.contains('mantine-TextInput-input'));
  typeInput(input, 'draft.md'); await settle();
  result.value.update({ ...props, degraded: 'Watch unavailable' }); await settle(); assert.equal(s.target.querySelector('input').value, 'draft.md');
  s.target.querySelector('form').dispatchEvent(new s.dom.window.Event('submit', { bubbles: true, cancelable: true })); await settle();
  assert.deepEqual(calls[0], ['create', '', 'draft.md', false]);
  result.value.update({ ...props, selection: ['a.md'] }); await settle();
  s.target.querySelector('[role=tree]').dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })); await settle();
  assert.equal(calls.length, 1); assert.ok(s.target.textContent.includes('No trash or undo'));
  s.target.querySelector('form').dispatchEvent(new s.dom.window.Event('submit', { bubbles: true, cancelable: true })); await settle();
  assert.deepEqual(calls[1], ['remove', ['a.md']]); await s.stop();
});


test('explorer drafts and pending selection survive view replacement without feedback into the controller', async () => {
  const s = await setup(); await s.start(); let draft = { form: null, name: '' }; const selections = [];
  const props = explorerFixture({ onDraft: value => { draft = value; }, onSelection: value => selections.push(value) });
  const first = s.components.mount('lunaris.file-explorer', s.target, props, s.ctx.signal); assert.equal(first.ok, true);
  s.target.querySelector('[role=tree]').dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'n', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })); await settle();
  typeInput(s.target.querySelector('input'), 'pending folder'); await settle();
  assert.equal(draft.name, 'pending folder'); first.value.dispose();
  const second = s.components.mount('lunaris.file-explorer', s.target, { ...props, initialDraft: draft, selection: ['not-loaded-yet'] }, s.ctx.signal);
  assert.equal(second.ok, true); await settle();
  assert.equal(s.target.querySelector('input').value, 'pending folder'); assert.deepEqual(selections, []);
  second.value.dispose(); await s.stop();
});


test('explorer restores selection, submits F2 rename, handles copy and opens the shared menu', async () => {
  const s = await setup(); await s.start(); const renamed = []; const buffered = [];
  s.dom.window.HTMLElement.prototype.getBoundingClientRect = () => new s.dom.window.DOMRect(0, 0, 320, 320);
  const props = explorerFixture({ selection: ['a.md'], onContextMenu: request => { const result = s.menus.open({ ...request, context: { source: 'lunaris.file-explorer', target: request.kind, data: {} } }, s.ctx.signal); assert.equal(result.ok, true); return result.value; }, onRename: async (...args) => { renamed.push(args); return true; }, onBuffer: (...args) => buffered.push(args) });
  const result = s.components.mount('lunaris.file-explorer', s.target, props, s.ctx.signal); assert.equal(result.ok, true); await settle();
  assert.equal(s.target.querySelector('[aria-selected=true]').textContent.includes('<img src=x>.md'), true);
  const tree = s.target.querySelector('[role=tree]');
  tree.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true }));
  assert.deepEqual(buffered, [[['a.md'], false]]);
  tree.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true })); await settle();
  const input = s.target.querySelector('input'); assert.ok(input); typeInput(input, 'renamed.md');
  input.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await settle();
  assert.deepEqual(renamed, [['a.md', 'renamed.md']]);
  tree.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true })); await settle();
  assert.ok(s.dom.window.document.querySelector('[data-lunaris-context-menu] .lm-root [role=menu]')); assert.equal(s.dom.window.document.querySelector('[data-portal]'), null);
  result.value.dispose(); await s.stop();
});


test('folder row selection does not toggle layout; double click and disclosure open exactly once', async () => {
  const s = await setup(); await s.start(); const toggles = [];
  s.dom.window.HTMLElement.prototype.getBoundingClientRect = () => new s.dom.window.DOMRect(0, 0, 320, 320);
  const props = explorerFixture({ expanded: [], onToggle: (...args) => toggles.push(args) });
  const mounted = s.components.mount('lunaris.file-explorer', s.target, props, s.ctx.signal); assert.equal(mounted.ok, true); await settle();
  const row = s.target.querySelector('[title=folder]').closest('[role=treeitem]');
  row.click(); await settle(); assert.deepEqual(toggles, []);
  row.dispatchEvent(new s.dom.window.MouseEvent('dblclick', { bubbles: true })); await settle(); assert.deepEqual(toggles, [['folder', true]]);
  row.querySelector('button').click(); await settle(); assert.deepEqual(toggles, [['folder', true], ['folder', false]]);
  await s.stop();
});

test('new Workspace context cannot display or operate the previous Vault tree', async () => {
  const s = await setup(); await s.start();
  const old = explorerFixture({ workspace: { vaultId: 'b', vaultName: 'Second Vault' } });
  const mounted = s.components.mount('lunaris.file-explorer', s.target, old, s.ctx.signal); assert.equal(mounted.ok, true);
  assert.equal(s.target.querySelector('[role=tree]'), null); assert.equal(s.target.querySelector('[role=status]').textContent, 'Loading');
  assert.equal(s.target.querySelector('[aria-label="New file"]'), null);
  mounted.value.update({ ...old, vaultId: 'b', data: [{ id: 'second.md', name: 'second.md', kind: 'file' }] }); await settle();
  assert.equal(s.target.querySelector('[title="Second Vault"] .lm-explorer-filename').textContent, 'Second Vault');
  assert.equal(s.target.querySelector('[title="a.md"]'), null); assert.ok(s.target.querySelector('[title="second.md"]'));
  await s.stop();
});


test('HTML5 drag/drop passes the hovered folder to the controller without toggling the source', async () => {
  const s = await setup(); await s.start(); const moves = [];
  s.dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    const row = this.closest('[role=treeitem]');
    return new s.dom.window.DOMRect(0, row ? parseFloat(row.style.top) || 0 : 0, 320, row ? 28 : 320);
  };
  const props = explorerFixture({ expanded: [], onMove: async (...args) => { moves.push(args); return true; } });
  const mounted = s.components.mount('lunaris.file-explorer', s.target, props, s.ctx.signal); assert.equal(mounted.ok, true); await settle();
  const source = s.target.querySelector('[title="a.md"]'); const target = s.target.querySelector('[title="folder"]');
  const transfer = { types: [], files: [], setData() {}, getData() { return ''; }, setDragImage() {}, effectAllowed: 'all', dropEffect: 'move' };
  function drag(element, type, y) {
    const event = new s.dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 80, clientY: y });
    Object.defineProperty(event, 'dataTransfer', { value: transfer }); element.dispatchEvent(event);
  }
  drag(source, 'dragstart', 70); await settle();
  drag(target, 'dragenter', 42); drag(target, 'dragover', 42); await settle();
  drag(target, 'drop', 42); drag(source, 'dragend', 42); await settle();
  assert.deepEqual(moves, [[['a.md'], 'folder']]); await s.stop();
});


test('explorer replaces header actions with a Files dropdown and protects the visible Vault root', async () => {
  const s = await setup(); await s.start(); const calls = [];
  s.dom.window.HTMLElement.prototype.getBoundingClientRect = () => new s.dom.window.DOMRect(0, 0, 320, 320);
  const props = explorerFixture({ workspace: { vaultId: 'a', vaultName: 'My Vault' },
    onRename: async (...args) => { calls.push(['rename', ...args]); return true; },
    onRemove: async (...args) => { calls.push(['remove', ...args]); return true; },
    onBuffer: (...args) => calls.push(['buffer', ...args]), onToggle: (...args) => calls.push(['toggle', ...args]) });
  const mounted = s.components.mount('lunaris.file-explorer', s.target, props, s.ctx.signal); assert.equal(mounted.ok, true); await settle();
  const toolbar = s.target.querySelector('.lm-explorer-toolbar');
  assert.equal(toolbar.textContent, 'Files'); assert.equal(toolbar.querySelectorAll('button').length, 1);
  assert.equal(toolbar.querySelector('[aria-label="New file"]'), null);
  assert.equal(toolbar.querySelector('[aria-label="New folder"]'), null);
  assert.equal(toolbar.querySelector('[aria-label=Actions]'), null);
  toolbar.querySelector('[aria-label=Tabs]').click(); await settle();
  assert.equal(toolbar.querySelector('[role=menuitem]').textContent, 'Files');
  assert.equal(toolbar.querySelector('[role=menuitem]').getAttribute('aria-current'), 'page');
  toolbar.querySelector('[role=menuitem]').click(); await new Promise(resolve => setTimeout(resolve, 250));
  const root = s.target.querySelector('[title="My Vault"]');
  assert.equal(root.closest('[role=treeitem]').getAttribute('aria-level'), '1');
  assert.equal(s.target.querySelector('[title=folder]').closest('[role=treeitem]').getAttribute('aria-level'), '2');
  root.closest('[role=treeitem]').click(); await settle();
  const tree = s.target.querySelector('[role=tree]');
  for (const key of ['F2', 'Delete', 'c', 'x']) tree.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key, ctrlKey: ['c', 'x'].includes(key), bubbles: true, cancelable: true }));
  root.dispatchEvent(new s.dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true })); await settle();
  assert.equal(s.target.querySelector('input'), null); assert.equal(s.target.querySelector('form'), null);
  assert.equal(!!s.target.querySelector('[role=menu]'), false); assert.deepEqual(calls, []);
  root.querySelector('button').click(); await settle();
  assert.equal(s.target.querySelector('[title="a.md"]'), null); assert.deepEqual(calls, []);
  root.querySelector('button').click(); await settle(); assert.ok(s.target.querySelector('[title="a.md"]'));
  mounted.value.update({ ...props, data: [] }); await settle(); assert.ok(s.target.querySelector('[title="My Vault"]'));
  await s.stop();
});
