import { readFileSync } from 'node:fs';
import { Pencil } from 'lucide';
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
import baseThemeEngine from '@lunaris/base-theme-engine';

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

test('real Luna presets adapt settings controls and opened menus without replacing inputs or embedded surfaces', async () => {
  const s = await setup(); await s.start();
  s.kernel.register(baseThemeEngine); await s.kernel.start(baseThemeEngine.manifest.id);
  const sheet = s.dom.window.document.createElement('style');
  sheet.textContent = readFileSync(new URL('../styles.css', import.meta.url), 'utf8').replace(/^@import .*$/gm, '');
  s.dom.window.document.head.append(sheet);
  const changes = [];
  const props = { items: [
    { id: 'test.locale', type: 'select', title: 'Язык', value: 'ru', options: [{ value: 'en', label: 'English' }, { value: 'ru', label: 'Русский' }] },
    { id: 'test.wrap', type: 'switch', title: 'Переносить длинные строки', value: false },
    { id: 'test.font', type: 'slider', title: 'Размер шрифта', value: 14, min: 10, max: 32, step: 1 },
  ], onChange: (...args) => changes.push(args), onRetry() {} };
  const mounted = s.components.mount('lunaris.settings-items', s.target, props, s.ctx.signal); assert.equal(mounted.ok, true);
  const root = s.target.querySelector('.lm-root'); const content = s.target.querySelector('.lm-settings-items');
  const toggle = s.target.querySelector('.mantine-Switch-input'); const picker = s.target.querySelector('[role=combobox]');
  const thumb = s.target.querySelector('.mantine-Slider-thumb');
  for (const id of ['windows-xp', 'windows-xp-dark']) {
    s.themes.select(`lunaris.base-theme-engine.${id}`); await settle();
    assert.equal(root.dataset.windowChrome, 'true'); assert.equal(root.style.backgroundColor, 'transparent');
    assert.equal(s.target.querySelector('.mantine-Switch-input'), toggle);
    assert.equal(s.target.querySelector('.mantine-Slider-thumb'), thumb);
    assert.equal(s.dom.window.getComputedStyle(thumb).borderRadius, 'var(--vault-radius)');
    assert.match(content.style.getPropertyValue('--vault-button-image'), /linear-gradient/);
    assert.equal(root.getAttribute('data-mantine-color-scheme'), id.endsWith('dark') ? 'dark' : 'light');
    picker.click(); await settle();
    assert.ok(s.target.querySelector('[role=option][data-checked]').textContent.includes('Русский'));
    picker.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
  }
  toggle.click(); await settle(); assert.deepEqual(changes, [['test.wrap', true]]);
  s.themes.select('lunaris.base-theme-engine.monochrome'); await settle();
  assert.equal(root.dataset.windowChrome, 'false'); assert.equal(content.style.getPropertyValue('--vault-button-image'), '');
  assert.equal(s.dom.window.getComputedStyle(thumb).borderRadius, '');
  await s.stop();
});

test('account access uses controlled Mantine password fields, escaped catalog names and owned presentation', async () => {
  const s = await setup(); await s.start(); const calls = [];
  const labels = ['connect', 'login', 'register', 'vaults', 'trash', 'local', 'address', 'username', 'password', 'showPassword', 'invitation', 'name', 'create', 'restore', 'delete', 'logout', 'refresh', 'empty', 'changeServer', 'passwordReset', 'cancel', 'accountMenu', 'vaultActions', 'loginDetail', 'registerDetail', 'connectDetail', 'vaultsDetail', 'trashDetail', 'emptyTrash', 'emptyDetail', 'emptyTrashDetail'];
  const props = { mode: 'register', text: Object.fromEntries(labels.map(key => [key, key])), address: 'https://notes.example', login: 'alice', password: 'typed password', invitation: 'invite', name: '', account: '',
    busy: false, error: '', allowLocal: true, invitationRequired: true, entries: [], onField: (...args) => calls.push(args),
    ...Object.fromEntries(['onSubmit', 'onToggleAuth', 'onLocal', 'onLogout', 'onOpen', 'onTrash', 'onRestore', 'onToggleTrash', 'onRefresh', 'onChangeServer'].map(name => [name, (...args) => calls.push([name, ...args])])) };
  const mounted = s.components.mount('lunaris.account-access', s.target, props, s.ctx.signal); assert.equal(mounted.ok, true);
  const password = s.target.querySelector('input[type=password]'); assert.ok(password); assert.equal(password.value, 'typed password');
  assert.equal(password.getAttribute('autocomplete'), 'new-password');
  mounted.value.update({ ...props, error: 'Try again' }); assert.equal(s.target.querySelector('input[type=password]'), password);
  mounted.value.update({ ...props, mode: 'vaults', entries: [{ id: 'v', name: '<script>bad</script>', detail: 'Notes' }] });
  assert.equal(s.target.querySelector('script'), null); assert.ok(s.target.textContent.includes('<script>bad</script>'));
  [...s.target.querySelectorAll('button')].find(button => button.textContent.includes('<script>')).click(); assert.ok(calls.some(call => call[0] === 'onOpen' && call[1] === 'v'));
  const toggle = s.target.querySelector('[aria-controls]');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(s.target.querySelector('.lm-account-disclosure').getAttribute('aria-hidden'), 'true');
  toggle.click(); await new Promise(setImmediate);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(s.target.querySelector('.lm-account-disclosure').getAttribute('aria-hidden'), 'false');
  s.target.querySelector('form').dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await new Promise(setImmediate);
  assert.equal(s.target.querySelector('.lm-account-disclosure').getAttribute('aria-hidden'), 'true');
  assert.equal(s.dom.window.document.activeElement, toggle);
  s.target.querySelector('[aria-label="vaultActions: <script>bad</script>"]').click(); await settle();
  const trashAction = s.target.querySelector('[role=menuitem]'); assert.ok(trashAction);
  trashAction.click(); await new Promise(setImmediate);
  assert.ok(calls.some(call => call[0] === 'onTrash' && call[1] === 'v'));
  mounted.value.update({ ...props, mode: 'trash', entries: [{ id: 'v', name: 'Archived', detail: 'Until tomorrow' }] });
  assert.equal(s.target.querySelector('.lm-account-row .lm-card-row'), null);
  assert.ok(s.target.querySelector('.lm-account-trash-entry').textContent.includes('Until tomorrow'));
  s.target.querySelector('.lm-account-row button').click();
  assert.ok(calls.some(call => call[0] === 'onRestore' && call[1] === 'v'));
  assert.equal(s.target.querySelector('.lm-root').dataset.presentation, 'standalone');
  mounted.value.update({ ...props, presentation: { mode: 'embedded', sizing: 'content' } }); assert.equal(s.target.querySelector('.lm-root').style.backgroundColor, 'transparent');
  await s.stop();
});

test('optional control finishes reset on theme replacement without repainting embedded surfaces', async () => {
  const s = await setup(); await s.start();
  s.target.style.backgroundColor = '#123456';
  s.themes.register({ id: 'test.finishes', name: 'Finishes', properties: {
    appearance: 'light', components: { controls: {
      buttonBackground: 'linear-gradient(#ffffff, #ece9d8)', buttonBorder: '#003C74',
      inputShadow: 'inset 1px 1px 2px #D6D2C2',
    } },
  } }, s.ctx.signal);
  assert.equal(s.components.mount('lunaris.startup-screen', s.target, {
    ...startup, presentation: { mode: 'embedded', sizing: 'content' },
  }, s.ctx.signal).ok, true);
  s.themes.select('test.finishes');
  const root = s.target.querySelector('.lm-root');
  const content = root.querySelector('.lm-startup');
  assert.equal(content.style.getPropertyValue('--vault-button-border'), '#003C74');
  assert.match(content.style.getPropertyValue('--vault-button-image'), /linear-gradient/);
  assert.equal(root.style.backgroundColor, 'transparent');
  assert.equal(s.target.style.backgroundColor, 'rgb(18, 52, 86)');
  s.themes.select(null);
  assert.equal(s.target.querySelector('.lm-root'), root);
  assert.equal(content.style.getPropertyValue('--vault-button-image'), '');
  assert.equal(content.style.getPropertyValue('--vault-button-border'), '');
  assert.equal(content.style.getPropertyValue('--vault-input-shadow'), '');
  await s.stop();
});

test('task checkbox role validates controlled state, forwards changes and inherits the embedded theme', async () => {
  const s = await setup(); await s.start();
  try {
    const changes = [];
    const props = { checked: false, disabled: false, label: '<Task>', onChange: checked => changes.push(checked) };
    const mounted = s.components.mount('lunaris.task-checkbox', s.target, props, s.ctx.signal);
    assert.equal(mounted.ok, true);
    const input = s.target.querySelector('input[type=checkbox]');
    assert.equal(input.getAttribute('aria-label'), '<Task>');
    assert.equal(input.closest('.lm-root').style.backgroundColor, 'transparent');
    assert.equal(input.closest('.lm-root').style.containerType, 'normal');
    input.click(); assert.deepEqual(changes, [true]);
    mounted.value.update({ ...props, checked: true, disabled: true });
    assert.equal(s.target.querySelector('input'), input); assert.equal(input.checked, true); assert.equal(input.disabled, true);
    input.click(); assert.deepEqual(changes, [true]);
    s.themes.register({ id: 'test.tasks', name: 'Tasks', properties: { appearance: 'light', colors: { accent: '#123456', onAccent: '#ffffff', controlBorder: '#777777' } } }, s.ctx.signal);
    s.themes.select('test.tasks');
    assert.equal(input.closest('.lm-task-checkbox').style.getPropertyValue('--vault-accent'), '#123456');
    assert.equal(mounted.value.update({ ...props, checked: 'yes' }).ok, false);
    assert.equal(mounted.value.update({ ...props, label: '' }).ok, false);
    assert.equal(mounted.value.update({ ...props, onChange: null }).ok, false);
  } finally { await s.stop(); }
});

test('editor role preserves its borrowed target through status/theme changes and confirms destructive reload', async () => {
  const s = await setup(); await s.start(); let target; let reloads = 0;
  const props = { documentKey: 'note', name: '<draft>.md', status: 'Unsaved', error: 'Conflict', ready: true, dirty: true, busy: false,
    saveLabel: 'Save', retryLabel: 'Retry', reloadLabel: 'Reload', discardLabel: 'Discard', cancelLabel: 'Cancel', onSave() {}, onReload() { reloads++; }, onTarget(value) { target = value; } };
  const mounted = s.components.mount('lunaris.text-editor', s.target, props, s.ctx.signal); assert.equal(mounted.ok, true);
  const borrowed = target; const owned = s.target.ownerDocument.createElement('div'); borrowed.append(owned);
  const click = label => [...s.target.querySelectorAll('button')].find(button => button.textContent === label).click();
  click('Reload'); await new Promise(setImmediate); assert.equal(reloads, 0); click('Discard'); assert.equal(reloads, 1);
  mounted.value.update({ ...props, status: 'Saved', dirty: false }); assert.equal(target, borrowed); assert.equal(borrowed.firstChild, owned);
  assert.equal(s.target.querySelector('.lm-root').style.backgroundColor, 'transparent'); assert.equal(s.target.querySelector('draft'), null);
  assert.equal(mounted.value.update({ ...props, onTarget: undefined }).ok, false);
  mounted.value.dispose(); assert.equal(target, null); await s.stop();
});
const selector = {
  art: 'ASCII', text: { logo: 'Lunaris', recent: 'Recent', empty: 'Empty', create: 'Create', select: 'Select', folder: 'Folder', folderPlaceholder: 'Choose folder', browse: 'Browse', name: 'Name', next: 'Next', retry: 'Retry' },
  mode: 'create', folder: 'Notes', name: 'Draft', busy: false, canContinue: true, error: '', historyError: '', status: '',
  entries: [{ reference: 'saved', name: '<img src=x>', label: 'Folder' }],
  onMode() {}, onName() {}, onBrowse() {}, onNext() {}, onRecent() {}, onRetry() {},
};

test('presentation uses public props rather than target classes and separates embedded surfaces from page themes', async () => {
  const s = await setup(); await s.start();
  s.target.className = 'lm-settings-section'; s.target.style.backgroundColor = '#123456';
  s.themes.register({ id: 'test.palette', name: 'Palette', properties: { colors: { background: '#abcdef', text: '#101010' } } }, s.ctx.signal);
  s.themes.select('test.palette');
  // A role's default sizing must not change because its target happens to have a class.
  const first = s.components.mount('lunaris.startup-screen', s.target, startup, s.ctx.signal); assert.equal(first.ok, true);
  let root = s.target.querySelector('.lm-root'); assert.equal(root.style.containerType, 'size');
  assert.equal(root.style.backgroundColor, 'rgb(171, 205, 239)');
  const embedded = { ...startup, presentation: { mode: 'embedded', sizing: 'content' } };
  assert.equal(first.value.update(embedded).ok, true);
  assert.equal(root.style.backgroundColor, 'transparent'); assert.equal(root.style.containerType, 'inline-size'); assert.equal(root.style.flexBasis, 'auto');
  assert.equal(s.target.querySelector('.lm-startup').style.backgroundColor, '');
  s.target.className = 'unrelated-container'; s.themes.select(null);
  assert.equal(root.style.containerType, 'inline-size'); assert.equal(root.style.backgroundColor, 'transparent');
  assert.equal(s.target.style.backgroundColor, 'rgb(18, 52, 86)');
  for (const presentation of [null, { mode: 'panel' }, { sizing: 'auto' }, { unexpected: true }, { get mode() { throw new Error('Getter invoked'); } }]) {
    assert.equal(first.value.update({ ...startup, presentation }).ok, false);
    assert.equal(root.style.containerType, 'inline-size'); assert.equal(root.style.backgroundColor, 'transparent');
  }
  first.value.dispose(); s.target.removeAttribute('class'); s.target.removeAttribute('style'); await s.stop();
});

test('active screen role lends stable targets, hides inactive content and validates selection without removing siblings', async () => {
  const s = await setup(); await s.start(); let targets;
  const onTargets = value => { targets = value; };
  const props = { ids: ['test.one', 'test.two'], activeId: 'test.one', onTargets };
  const mounted = s.components.mount('lunaris.active-screen', s.target, props, s.ctx.signal); assert.equal(mounted.ok, true);
  const first = targets.get('test.one'); const second = targets.get('test.two');
  const input = s.dom.window.document.createElement('input'); first.append(input); input.value = 'Draft';
  assert.equal(first.hidden, false); assert.equal(second.hidden, true); assert.equal(second.hasAttribute('inert'), true);
  mounted.value.update({ ...props, activeId: 'test.two' });
  assert.equal(targets.get('test.one'), first); assert.equal(targets.get('test.two'), second);
  assert.equal(first.hidden, true); assert.equal(first.querySelector('input'), input);
  assert.equal(mounted.value.update({ ...props, activeId: 'test.missing' }).ok, false);
  assert.equal(mounted.value.update({ ...props, ids: ['test.one', 'test.one'] }).ok, false);
  assert.equal(second.hidden, false); assert.equal(input.value, 'Draft');
  mounted.value.dispose(); assert.equal(targets, null); assert.equal(s.target.textContent, 'Sibling'); await s.stop();
});

test('settings roles escape labels, preserve borrowed targets and validate navigation and section identity', async () => {
  const s = await setup(); await s.start(); let targets;
  const props = { title: 'Example', emptyLabel: 'Empty', sections: [{ id: 'test.section', title: 'Controls' }], onTargets: value => { targets = value; } };
  const page = s.components.mount('lunaris.settings-page', s.target, props, s.ctx.signal); assert.equal(page.ok, true);
  const group = s.target.querySelector('.lm-settings-group');
  assert.equal(s.target.ownerDocument.getElementById(group.getAttribute('aria-labelledby')).textContent, 'Controls');
  assert.ok(s.target.querySelector('.lm-settings-page-header h1'));
  const target = targets.get('test.section'); const input = s.dom.window.document.createElement('input'); input.value = 'Draft'; target.append(input);
  page.value.update({ ...props, title: 'Translated', sections: [{ id: 'test.section', title: 'Updated' }] });
  assert.equal(targets.get('test.section'), target); assert.equal(target.querySelector('input'), input);
  assert.equal(s.target.querySelector('.lm-settings-group'), group);
  assert.equal(s.target.ownerDocument.getElementById(group.getAttribute('aria-labelledby')).textContent, 'Updated');
  assert.equal(page.value.update({ ...props, sections: [props.sections[0], props.sections[0]] }).ok, false);
  let selected; const navProps = { title: 'Settings', emptyLabel: 'Empty', categories: [{ id: 'test.category', title: '<img src=x>' }], selectedId: null, onSelect: id => { selected = id; } };
  const nav = s.components.mount('lunaris.settings-navigation', s.target, navProps, s.ctx.signal); assert.equal(nav.ok, true);
  const header = s.target.querySelector('.lm-settings-navigation .lm-tool-panel-toolbar');
  assert.equal(header.querySelector('h2').textContent, 'Settings');
  assert.equal(header.querySelector('button, svg, [aria-haspopup]'), null);
  assert.ok(s.target.querySelector('.lm-settings-category .mantine-Button-section svg'));
  s.target.querySelector('.lm-settings-category').click(); assert.equal(selected, 'test.category'); assert.equal(s.target.querySelector('img'), null);
  assert.equal(nav.value.update({ ...navProps, selectedId: 'test.missing' }).ok, false);
  assert.equal(input.value, 'Draft'); page.value.dispose(); assert.equal(targets, null); nav.value.dispose(); await s.stop();
});

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
  assert.deepEqual(s.components.list(), ['lunaris.account-access', 'lunaris.active-screen', 'lunaris.callout-header', 'lunaris.client-update', 'lunaris.context-menu', 'lunaris.file-explorer', 'lunaris.settings-choices', 'lunaris.settings-items', 'lunaris.settings-navigation', 'lunaris.settings-page', 'lunaris.sidebar-rail', 'lunaris.startup-screen', 'lunaris.status-bar', 'lunaris.task-checkbox', 'lunaris.text-editor', 'lunaris.vault-selector', 'lunaris.window-titlebar', 'lunaris.workspace-empty', 'lunaris.workspace-header', 'lunaris.workspace-layout']);
  const owner = s.ctx.scope.child();
  const mounted = s.components.mount('lunaris.vault-selector', s.target, selector, owner.signal); assert.equal(mounted.ok, true);
  assert.ok(s.target.querySelector('.mantine-Button-root')); assert.ok(s.target.querySelector('.mantine-TextInput-input'));
  assert.equal(s.target.querySelector('img'), null); assert.equal(s.target.firstElementChild.textContent, 'Sibling');
  assert.ok(s.logs.some(log => log[0] === 'info' && log[1] === plugin.manifest.id && log[3]?.code === 'MANTINE_COMPONENTS_READY'));
  await owner.dispose(); assert.equal(s.target.querySelector('.lm-root'), null); await s.stop();
});

test('settings choices validate data, render single values as text and retain live controls on updates', async () => {
  const s = await setup(); await s.start(); const changes = [];
  const props = { fields: [{ id: 'locale', label: 'Language', value: 'en', options: [{ value: 'en', label: 'English' }] }],
    disabled: false, error: '', canRetry: false, retryLabel: 'Retry', onChange: (...args) => changes.push(args), onRetry() {} };
  const mounted = s.components.mount('lunaris.settings-choices', s.target, props, s.ctx.signal); assert.equal(mounted.ok, true);
  assert.equal(s.target.querySelector('select'), null); assert.match(s.target.textContent, /LanguageEnglish/);
  const multiple = { ...props, fields: [{ ...props.fields[0], options: [...props.fields[0].options, { value: 'fr', label: '<French>' }] }] };
  assert.equal(mounted.value.update(multiple).ok, true); const input = s.target.querySelector('[role=combobox]');
  input.click(); await new Promise(resolve => setImmediate(resolve));
  const choice = [...s.target.querySelectorAll('[role=option]')].find(option => option.textContent.trim() === '<French>');
  assert.ok(choice); choice.click(); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(changes, [['locale', 'fr']]);
  assert.equal(mounted.value.update({ ...multiple, fields: [{ ...multiple.fields[0], value: 'fr', label: 'Langue' }], error: 'Save failed' }).ok, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(s.target.querySelector('[role=combobox]'), input); assert.equal(input.textContent, '<French>'); assert.equal(s.target.querySelector('img'), null);
  assert.equal(mounted.value.update({ ...multiple, fields: [...multiple.fields, ...multiple.fields] }).ok, false);
  assert.equal(s.target.querySelector('[role=combobox]'), input); assert.match(s.target.querySelector('[role=alert]').textContent, /Save failed/);
  assert.equal(s.target.querySelector('.lm-root').style.backgroundColor, 'transparent');
  assert.equal(s.target.querySelector('.lm-root').style.containerType, 'inline-size'); await s.stop();
});

test('declarative item role renders typed Mantine controls, forwards typed values and preserves layout/input identity', async () => {
  const s = await setup(); await s.start(); const changes = [];
  const fields = [
    { id: 'test.select', title: 'Theme', type: 'select', value: 'mono', options: [{ value: 'mono', label: 'Monochrome' }] },
    { id: 'test.switch', title: 'Enabled', type: 'switch', value: false },
    { id: 'test.text', title: 'Name', description: 'Visible label', type: 'text', value: 'Old', layout: 'stacked' },
    { id: 'test.number', title: 'Size', type: 'number', value: 2, min: 1, max: 8, step: 1 },
  ];
  const props = { items: fields, onChange: (...args) => changes.push(args), onRetry() {} };
  const mounted = s.components.mount('lunaris.settings-items', s.target, props, s.ctx.signal); assert.equal(mounted.ok, true);
  assert.equal(s.target.querySelector('select'), null); assert.match(s.target.textContent, /Monochrome/);
  const text = s.target.querySelector('[data-settings-item="test.text"] input');
  s.target.querySelector('[data-settings-item="test.switch"] input').click(); typeInput(text, 'New');
  typeInput(s.target.querySelector('[data-settings-item="test.number"] input'), '4');
  assert.deepEqual(changes, [['test.switch', true], ['test.text', 'New'], ['test.number', 4]]);
  assert.equal(mounted.value.update({ ...props, items: fields.map(item => ({ ...item, title: `Updated ${item.title}` })) }).ok, true);
  assert.equal(s.target.querySelector('[data-settings-item="test.text"] input'), text);
  assert.equal(text.getAttribute('aria-label'), 'Updated Name');
  assert.equal(s.target.querySelector('[data-settings-item="test.text"]').dataset.layout, 'stacked');
  assert.equal(mounted.value.update({ ...props, items: [{ ...fields[1], value: 'bad' }] }).ok, false); await s.stop();
});

test('Settings Select opens themed options, supports keyboard selection and Escape, and respects disabled state', async () => {
  const s = await setup(); await s.start(); const changes = []; const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
  const props = { fields: [{ id: 'locale', label: 'Language', value: 'en', options: [{ value: 'en', label: 'English' }, { value: 'fr', label: 'French' }] }],
    disabled: false, error: '', canRetry: false, retryLabel: 'Retry', onChange: (...args) => changes.push(args), onRetry() {} };
  const mounted = s.components.mount('lunaris.settings-choices', s.target, props, s.ctx.signal); assert.equal(mounted.ok, true);
  const trigger = s.target.querySelector('[role=combobox]'); assert.equal(s.target.querySelector('select'), null);
  assert.equal(trigger.tagName, 'BUTTON'); assert.equal(trigger.hasAttribute('contenteditable'), false);
  assert.equal(s.target.querySelector('input:not([type=hidden])'), null);
  trigger.focus(); trigger.click(); await settle(); assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  const list = s.dom.window.document.getElementById(trigger.getAttribute('aria-controls'));
  assert.ok(list.closest('.lm-setting-dropdown')); assert.equal(list.closest('.lm-root'), trigger.closest('.lm-root'));
  assert.deepEqual([...list.querySelectorAll('[role=option]')].map(option => option.textContent.trim()), ['English', 'French']);
  trigger.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true })); await settle();
  trigger.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true })); await settle();
  assert.deepEqual(changes, [['locale', 'fr']]); assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  trigger.click(); await settle(); trigger.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
  assert.equal(trigger.getAttribute('aria-expanded'), 'false'); assert.equal(s.dom.window.document.activeElement, trigger); assert.equal(changes.length, 1);
  mounted.value.update({ ...props, disabled: true }); await settle(); trigger.click(); await settle();
  assert.equal(trigger.disabled, true); assert.notEqual(trigger.getAttribute('aria-expanded'), 'true'); await s.stop();
});

test('theme replacement and clearing update mounted roots without affecting the document or stored preferences', async () => {
  const s = await setup(); await s.start();
  assert.equal(s.components.mount('lunaris.startup-screen', s.target, startup, s.ctx.signal).ok, true);
  assert.equal(s.components.mount('lunaris.vault-selector', s.target, selector, s.ctx.signal).ok, true);
  const input = s.target.querySelector('input'); const roots = [...s.target.querySelectorAll('.lm-root')];
  const theme = { id: 'test.theme', name: 'Custom', properties: { appearance: 'light', colors: { background: '#ffffff', text: '#202020', caret: '#234567', error: '#ff0000' }, geometry: { radius: { medium: 12 } }, typography: { fontFamily: ['Arial', 'sans-serif'], fontSize: 16 } } };
  s.themes.register(theme, s.ctx.signal); s.themes.select(theme.id);
  assert.equal(s.target.querySelector('section').closest('.lm-root').style.backgroundColor, 'rgb(255, 255, 255)');
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
  assert.equal(s.target.querySelector('section').closest('.lm-root').style.backgroundColor, 'transparent');
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
  assert.equal(doc.querySelector('.lm-context-surface').closest('.lm-root').style.backgroundColor, 'transparent');
  assert.ok(doc.querySelector('[role=menuitem] .mantine-Menu-itemSection[data-position=left] svg[aria-hidden=true]'));
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
  return { supportedExtensions: ['md'], vaultId: 'a', workspace: { vaultId: 'a' }, data: [{ id: 'folder', name: 'Folder', kind: 'directory', children: [{ id: 'folder/note.md', name: 'note.md', kind: 'file' }] }, { id: 'a.md', name: '<img src=x>.md', kind: 'file' }],
    expanded: ['folder'], selection: [], busy: false, loading: false, error: '', degraded: '', canPaste: false,
    text: { sort: 'Sort', sortAscending: 'Name: A–Z', sortDescending: 'Name: Z–A', expandAll: 'Expand all', unnamedFile: 'Unnamed.md', unnamedFolder: 'Unnamed folder', tabs: 'Tabs', title: 'Files', newFile: 'New file', newFolder: 'New folder', rename: 'Rename', copy: 'Copy', cut: 'Cut', paste: 'Paste', remove: 'Delete', refresh: 'Refresh', actions: 'Actions', name: 'Name', create: 'Create', cancel: 'Cancel', empty: 'No files', loading: 'Loading', root: 'Vault root', retry: 'Retry', confirmDelete: 'Delete permanently?', deleteWarning: 'No trash or undo' },
    initialDraft: { form: null, name: '' }, onContextMenu() {}, onDraft() {}, onToggle() {}, onSelection() {}, onBuffer() {}, onCreate: async () => true, onRename: async () => true, onMove: async () => true, onPaste: async () => true, onRemove: async () => true, onRefresh() {}, ...overrides };
}

test('explorer toolbar creates in the selected folder, sorts through a themed menu and expands the root', async () => {
  const s = await setup(); await s.start(); const sorts = []; let expands = 0; const drafts = [];
  s.dom.window.HTMLElement.prototype.getBoundingClientRect = () => new s.dom.window.DOMRect(0, 0, 320, 320);
  const props = explorerFixture({ selection: ['folder'], onSort: direction => sorts.push(direction), onExpandAll: async () => { expands++; }, onDraft: draft => drafts.push(draft) });
  const mounted = s.components.mount('lunaris.file-explorer', s.target, props, s.ctx.signal); await settle();
  const actions = s.target.querySelector('.lm-explorer-actions');
  assert.equal(actions.querySelectorAll('button').length, 4);
  assert.equal(actions.previousElementSibling.className.includes('lm-explorer-toolbar'), true);
  actions.querySelector('[aria-label="Sort"]').click(); await settle();
  const descending = [...s.target.querySelectorAll('[role=menuitem]')].find(node => node.textContent === 'Name: Z–A');
  assert.ok(descending); descending.click(); await settle(); assert.deepEqual(sorts, ['desc']);
  actions.querySelector('[aria-label="Expand all"]').click(); await settle(); assert.equal(expands, 1);
  actions.querySelector('[aria-label="New folder"]').click(); await settle();
  assert.equal(drafts.at(-1).form.kind, 'folder'); assert.equal(drafts.at(-1).form.parent, 'folder');
  const input = s.target.querySelector('.lm-explorer-create input');
  input.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await settle();
  actions.querySelector('[aria-label="New file"]').click(); await settle(); assert.equal(drafts.at(-1).form.kind, 'file');
  mounted.value.update({ ...props, busy: true }); await settle();
  assert.ok([...actions.querySelectorAll('.mantine-ActionIcon-root')].every(button => button.disabled));
  await s.stop();
});

test('right-click preserves invocation multi-selection, coordinates and safe root/background commands', async () => {
  const s = await setup(); await s.start(); const contexts = []; const buffered = [];
  s.dom.window.HTMLElement.prototype.getBoundingClientRect = () => new s.dom.window.DOMRect(0, 0, 320, 320);
  const props = explorerFixture({ selection: ['folder', 'a.md'], onContextMenu: request => { contexts.push(request); }, onBuffer: (...args) => buffered.push(args) });
  const mounted = s.components.mount('lunaris.file-explorer', s.target, props, s.ctx.signal); await settle();
  const rightClick = node => node.dispatchEvent(new s.dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 75, clientY: 95 }));
  rightClick(s.target.querySelector('[title="a.md"]')); await settle();
  assert.deepEqual(contexts[0].selection, ['folder', 'a.md']); assert.equal(contexts[0].path, 'a.md'); assert.equal(contexts[0].kind, 'file');
  assert.equal(contexts[0].x, 75); assert.equal(contexts[0].y, 95);
  const resolve = request => s.menus.resolve({ source: 'lunaris.file-explorer', target: request.kind, data: {} }, s.ctx.signal, request.entries).value.items;
  assert.deepEqual(resolve(contexts[0]).map(item => item.icon), ['copy', 'cut', 'trash']);
  contexts[0].entries.find(item => item.id.endsWith('.copy')).run({}); assert.deepEqual(buffered, [[['folder', 'a.md'], false]]);
  rightClick(s.target.querySelector('[data-root]')); await settle();
  assert.equal(contexts[1].kind, 'root'); assert.equal(contexts[1].path, ''); assert.deepEqual(contexts[1].selection, []);
  assert.equal(contexts[1].entries.find(item => item.id.endsWith('.remove')), undefined);
  assert.equal(s.target.querySelectorAll('[role=treeitem][aria-selected=true]').length, 0);
  assert.deepEqual(resolve(contexts[1]).map(item => item.id.split('.').at(-1)), ['newFile', 'newFolder', 'refresh']);
  rightClick(s.target.querySelector('.lm-explorer-tree')); await settle();
  assert.equal(contexts[2].kind, 'background'); assert.equal(contexts[2].path, null); assert.equal(contexts[2].destination, '');
  assert.deepEqual(resolve(contexts[2]).map(item => item.id.split('.').at(-1)), ['newFile', 'newFolder', 'refresh']);
  mounted.value.update({ ...props, selection: ['a.md'] }); await settle();
  s.target.querySelector('.lm-explorer-tree').click(); await settle();
  assert.equal(s.target.querySelectorAll('[role=treeitem][aria-selected=true]').length, 0);
  s.target.querySelector('[role=tree]').dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true })); await settle();
  assert.equal(contexts[3].kind, 'root'); assert.deepEqual(contexts[3].selection, []);
  await s.stop();
});

test('Shift-click keeps range selection without enabling navigation focus chrome; arrows and pointer input switch modality', async () => {
  const s = await setup(); await s.start(); const selections = [];
  s.dom.window.HTMLElement.prototype.getBoundingClientRect = () => new s.dom.window.DOMRect(0, 0, 320, 320);
  s.components.mount('lunaris.file-explorer', s.target, explorerFixture({ onSelection: paths => selections.push(paths) }), s.ctx.signal); await settle();
  const explorer = s.target.querySelector('.lm-explorer'); const tree = s.target.querySelector('[role=tree]');
  const folder = s.target.querySelector('[title=folder]').closest('[role=treeitem]');
  const file = s.target.querySelector('[title="a.md"]').closest('[role=treeitem]');
  folder.click(); await settle();
  tree.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'Shift', shiftKey: true, bubbles: true })); await settle();
  assert.equal(explorer.hasAttribute('data-keyboard-navigation'), false);
  file.dispatchEvent(new s.dom.window.MouseEvent('pointerdown', { shiftKey: true, bubbles: true }));
  file.dispatchEvent(new s.dom.window.MouseEvent('click', { shiftKey: true, bubbles: true })); await settle();
  assert.deepEqual(selections.at(-1), ['folder', 'folder/note.md', 'a.md']); assert.equal(explorer.hasAttribute('data-keyboard-navigation'), false);
  tree.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true })); await settle();
  assert.equal(explorer.hasAttribute('data-keyboard-navigation'), true);
  file.dispatchEvent(new s.dom.window.MouseEvent('pointerdown', { shiftKey: true, bubbles: true })); await settle();
  assert.equal(explorer.hasAttribute('data-keyboard-navigation'), false); await s.stop();
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

test('explorer creates in a tree row, preserves drafts and confirms permanent deletion before calling controller', async () => {
  const s = await setup(); await s.start(); const calls = [];
  const props = explorerFixture({ onCreate: async (...args) => { calls.push(['create', ...args]); return true; }, onRemove: async paths => { calls.push(['remove', paths]); return true; } });
  const result = s.components.mount('lunaris.file-explorer', s.target, props, s.ctx.signal); assert.equal(result.ok, true, s.logs.map(log => log[3]?.error?.stack).filter(Boolean).join('\n'));
  s.target.querySelector('[role=tree]').dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true, cancelable: true })); await settle();
  const input = s.target.querySelector('input'); assert.ok(input.classList.contains('mantine-TextInput-input'));
  assert.ok(input.closest('[role=treeitem]')); assert.equal(s.target.querySelector('form'), null);
  typeInput(input, 'draft.md'); await settle();
  result.value.update({ ...props, degraded: 'Watch unavailable' }); await settle(); assert.equal(s.target.querySelector('input').value, 'draft');
  input.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await settle();
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

test('inline creation opens its destination, guards repeated Enter, retains failed names and cancels with Escape', async () => {
  const s = await setup(); await s.start(); const calls = []; const selections = []; let finish;
  s.dom.window.HTMLElement.prototype.getBoundingClientRect = () => new s.dom.window.DOMRect(0, 0, 320, 320);
  const props = explorerFixture({ expanded: [], selection: ['folder'], onSelection: paths => selections.push(paths),
    onContextMenu: request => { request.entries.find(entry => entry.id.endsWith('.newFile')).run({}); },
    onCreate: (...args) => { calls.push(args); return calls.length === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(true); } });
  s.components.mount('lunaris.file-explorer', s.target, props, s.ctx.signal); await settle();
  s.target.querySelector('[title=folder]').dispatchEvent(new s.dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true })); await settle();
  const input = s.target.querySelector('.lm-explorer-create input'); assert.ok(input);
  assert.equal(input.closest('[role=treeitem]').getAttribute('aria-level'), '3'); assert.equal(s.target.querySelector('form'), null);
  typeInput(input, 'pending.md'); await settle();
  const enter = () => input.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  enter(); enter(); await settle(); assert.equal(calls.length, 1); assert.equal(input.disabled, true);
  finish(false); await settle(); assert.equal(input.value, 'pending'); assert.equal(input.disabled, false); assert.equal(s.dom.window.document.activeElement, input);
  enter(); await settle(); assert.deepEqual(calls, [['folder', 'pending.md', false], ['folder', 'pending.md', false]]); assert.equal(s.target.querySelector('input'), null);
  s.target.querySelector('[role=tree]').dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'n', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })); await settle();
  s.target.querySelector('.lm-explorer-create input').dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await settle();
  assert.equal(s.target.querySelector('input'), null); assert.equal(calls.length, 2); assert.ok(selections.every(paths => !paths.some(path => path.startsWith('/'))));
  await s.stop();
});

test('real menu editors keep initial focus, sort named drafts after folders and finish when clicking away', async () => {
  const s = await setup(); await s.start(); const created = [];
  s.dom.window.HTMLElement.prototype.getBoundingClientRect = () => new s.dom.window.DOMRect(0, 0, 320, 320);
  const outside = s.dom.window.document.createElement('button'); outside.textContent = 'Outside'; s.target.append(outside);
  const props = explorerFixture({ expanded: [], selection: ['Zulu.md'],
    data: [{ id: 'folder', name: 'Folder', kind: 'directory', children: [] }, { id: 'Alpha.md', name: 'Alpha.md', kind: 'file' }, { id: 'Zulu.md', name: 'Zulu.md', kind: 'file' }],
    onContextMenu: request => s.menus.open({ ...request, context: { source: 'lunaris.file-explorer', target: request.kind, data: {} } }, s.ctx.signal).value,
    onCreate: async (...args) => { created.push(args); return true; } });
  const mounted = s.components.mount('lunaris.file-explorer', s.target, props, s.ctx.signal); await settle();
  const rightClick = element => element.dispatchEvent(new s.dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  const choose = label => [...s.dom.window.document.querySelectorAll('[role=menuitem]')].find(item => item.textContent === label).click();
  rightClick(s.target.querySelector('[data-root]')); await settle(); choose('New file'); await settle();
  let input = s.target.querySelector('input'); assert.ok(input); assert.equal(s.dom.window.document.activeElement, input);
  assert.equal(input.value, 'Unnamed'); assert.equal(input.selectionStart, 0); assert.equal(input.selectionEnd, 'Unnamed'.length);
  const position = () => [...s.target.querySelectorAll('[role=treeitem]')].indexOf(input.closest('[role=treeitem]'));
  assert.equal(position(), 3); typeInput(input, 'A new name.md'); await settle(); assert.equal(position(), 3);
  outside.focus(); await settle(); assert.deepEqual(created, [['', 'A new name.md', false]]); assert.equal(s.target.querySelector('input'), null);
  assert.equal(s.dom.window.document.activeElement, outside);
  rightClick(s.target.querySelector('[title="Zulu.md"]')); await settle(); choose('Rename'); await settle();
  input = s.target.querySelector('input'); assert.ok(input); assert.equal(s.dom.window.document.activeElement, input);
  outside.focus(); await settle(); assert.equal(s.target.querySelector('input'), null);
  mounted.value.update({ ...props, data: [...props.data, { id: 'Unnamed.md', name: 'Unnamed.md', kind: 'file' }] }); await settle();
  s.target.querySelector('[role=tree]').dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true, cancelable: true })); await settle();
  input = s.target.querySelector('input'); assert.equal(input.value, 'Unnamed 2'); typeInput(input, ''); await settle();
  outside.focus(); await settle(); assert.equal(s.target.querySelector('input'), null); assert.equal(created.length, 1);
  outside.remove(); await s.stop();
});


test('explorer restores selection, submits F2 rename, handles copy and opens the shared menu', async () => {
  const s = await setup(); await s.start(); const renamed = []; const buffered = [];
  s.dom.window.HTMLElement.prototype.getBoundingClientRect = () => new s.dom.window.DOMRect(0, 0, 320, 320);
  const props = explorerFixture({ selection: ['a.md'], onContextMenu: request => { const result = s.menus.open({ ...request, context: { source: 'lunaris.file-explorer', target: request.kind, data: {} } }, s.ctx.signal); assert.equal(result.ok, true); return result.value; }, onRename: async (...args) => { renamed.push(args); return true; }, onBuffer: (...args) => buffered.push(args) });
  const result = s.components.mount('lunaris.file-explorer', s.target, props, s.ctx.signal); assert.equal(result.ok, true); await settle();
  assert.equal(s.target.querySelector('[aria-selected=true] .lm-explorer-filename').textContent, '<img src=x>');
  const tree = s.target.querySelector('[role=tree]');
  tree.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true }));
  assert.deepEqual(buffered, [[['a.md'], false]]);
  tree.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true })); await settle();
  const input = s.target.querySelector('input'); assert.ok(input); assert.equal(input.value, '<img src=x>'); typeInput(input, 'renamed');
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


test('extension policy accepts new formats and preserves dotted directories and dotfiles', async () => {
  const s = await setup(); await s.start();
  s.dom.window.HTMLElement.prototype.getBoundingClientRect = () => new s.dom.window.DOMRect(0, 0, 320, 480);
  const props = explorerFixture({ supportedExtensions: ['md', 'txt'], expanded: [], data: [
    { id: 'folder.md', name: 'folder.md', kind: 'directory', children: [] },
    { id: 'note.MD', name: 'note.MD', kind: 'file' },
    { id: 'readme.txt', name: 'readme.txt', kind: 'file' },
    { id: 'archive.zip', name: 'archive.zip', kind: 'file' },
    { id: '.md', name: '.md', kind: 'file' },
  ] });
  const mounted = s.components.mount('lunaris.file-explorer', s.target, props, s.ctx.signal); assert.equal(mounted.ok, true); await settle();
  const row = path => s.target.querySelector('[title="' + path + '"]');
  assert.equal(row('note.MD').querySelector('.lm-explorer-filename').textContent, 'note');
  assert.equal(row('note.MD').querySelector('.lm-explorer-extension'), null);
  assert.equal(row('readme.txt').querySelector('.lm-explorer-filename').textContent, 'readme');
  assert.equal(row('readme.txt').querySelector('.lm-explorer-extension'), null);
  assert.equal(row('archive.zip').querySelector('.lm-explorer-filename').textContent, 'archive');
  assert.equal(row('archive.zip').querySelector('.lm-explorer-extension').textContent, 'zip');
  for (const path of ['folder.md', '.md']) {
    assert.equal(row(path).querySelector('.lm-explorer-filename').textContent, path);
    assert.equal(row(path).querySelector('.lm-explorer-extension'), null);
  }
  await s.stop();
});


test('active document marking survives cleared selection and focus outside the tree', async () => {
  const s = await setup(); await s.start(); const opened = []; const selections = [];
  s.dom.window.HTMLElement.prototype.getBoundingClientRect = () => new s.dom.window.DOMRect(0, 0, 320, 320);
  const props = explorerFixture({ activePath: 'a.md', selection: ['a.md'], onOpen: async path => { opened.push(path); }, onSelection: paths => selections.push(paths) });
  const mounted = s.components.mount('lunaris.file-explorer', s.target, props, s.ctx.signal); assert.equal(mounted.ok, true); await settle();
  s.target.querySelector('[title="a.md"]').closest('[role=treeitem]').click(); await settle();
  assert.deepEqual(opened, ['a.md']);
  s.target.querySelector('.lm-explorer-tree').click(); await settle();
  assert.deepEqual(selections.at(-1), []);
  mounted.value.update({ ...props, selection: [] }); await settle();
  const outside = s.dom.window.document.createElement('button'); s.target.append(outside); outside.focus(); await settle();
  assert.equal(s.dom.window.document.activeElement, outside);
  assert.equal(s.target.querySelector('[data-active]').getAttribute('title'), 'a.md');
  assert.equal(s.target.querySelector('[data-active]').getAttribute('aria-current'), 'page');
  assert.equal(s.target.querySelector('[data-selected]'), null);
  await s.stop();
});

test('Vault footer opens an upward recent menu with safe names, selection, callbacks and busy state', async () => {
  const s = await setup(); await s.start(); const chosen = []; let changed = 0;
  const vaultSwitcher = { name: 'Current vault', entries: Array.from({ length: 6 }, (_, i) => ({ reference: 'ref-' + i, name: '<img src=x> Vault ' + i, label: 'Folder ' + i })), activeReference: 'ref-0', busy: false, error: '', historyError: false, onRecent: ref => chosen.push(ref), onChange: () => changed++, onRetry() {} };
  const base = explorerFixture();
  const props = { ...base, vaultSwitcher, text: { ...base.text, switchVault: 'Switch vault', recentVaults: 'Recent vaults' } };
  const mounted = s.components.mount('lunaris.file-explorer', s.target, props, s.ctx.signal); assert.equal(mounted.ok, true); await settle();
  const footer = s.target.querySelector('.lm-vault-switcher'); assert.equal(footer.previousElementSibling.className.includes('lm-explorer-tree'), true);
  const toggle = footer.querySelector('button'); assert.equal(toggle.textContent, 'Current vault');
  toggle.click(); await settle();
  assert.equal(toggle.getAttribute('aria-expanded'), 'true'); assert.equal(footer.querySelectorAll('[role=menuitem]').length, 5);
  assert.equal(footer.querySelector('[aria-current=true]').textContent, '<img src=x> Vault 0'); assert.equal(footer.querySelector('img'), null);
  assert.equal(footer.querySelector('[role=menuitem]').title, 'Folder 0');
  footer.querySelectorAll('[role=menuitem]')[1].click(); await settle(); assert.deepEqual(chosen, ['ref-1']);
  toggle.click(); await settle(); [...footer.querySelectorAll('[role=menuitem]')].at(-1).click(); await settle(); assert.equal(changed, 1);
  mounted.value.update({ ...props, vaultSwitcher: { ...vaultSwitcher, busy: true } }); assert.equal(toggle.disabled, true);
  assert.equal(mounted.value.update({ ...props, vaultSwitcher: { ...vaultSwitcher, onChange: null } }).ok, false);
  await s.stop();
});


test('window titlebar owns one surface, preserves controls on updates and separates drag from button actions', async () => {
  const s = await setup(); await s.start(); const calls = [];
  try {
    const props = { title: '<Note> — Lunaris', focused: true, maximized: false,
      canMinimize: true, canMaximize: true, canClose: true, canDrag: true,
      minimizeLabel: 'Minimize', maximizeLabel: 'Maximize', restoreLabel: 'Restore', closeLabel: 'Close',
      onMinimize: () => calls.push('minimize'), onToggleMaximize: () => calls.push('maximize'), onClose: () => calls.push('close'), onDrag: () => calls.push('drag') };
    const mounted = s.components.mount('lunaris.window-titlebar', s.target, props, s.ctx.signal); assert.equal(mounted.ok, true);
    const header = s.target.querySelector('header'); const close = header.querySelector('[aria-label=Close]');
    const sheet = s.dom.window.document.createElement('style');
    sheet.textContent = readFileSync(new URL('../styles.css', import.meta.url), 'utf8').replace(/^@import .*;$/gm, '');
    s.dom.window.document.head.append(sheet);
    assert.equal(s.target.firstChild.textContent, 'Sibling');
    assert.equal(header.closest('.lm-root').style.backgroundColor, 'transparent');
    assert.equal(header.closest('.lm-root').dataset.sizing, 'content');
    assert.equal(s.dom.window.getComputedStyle(header).margin, '0px');
    assert.equal(s.dom.window.getComputedStyle(header).borderRadius, '0px');
    assert.equal(header.querySelector('.lm-window-titlebar-title').textContent, props.title);
    const drag = header.querySelector('.lm-window-titlebar-drag');
    drag.dispatchEvent(new s.dom.window.MouseEvent('mousedown', { bubbles: true, button: 0, detail: 1 }));
    drag.dispatchEvent(new s.dom.window.MouseEvent('mousedown', { bubbles: true, button: 2 }));
    drag.dispatchEvent(new s.dom.window.MouseEvent('dblclick', { bubbles: true, button: 0 }));
    close.click(); header.querySelector('[aria-label=Minimize]').click();
    assert.deepEqual(calls, ['drag', 'maximize', 'close', 'minimize']);
    mounted.value.update({ ...props, title: 'Other', maximized: true, focused: false, canMinimize: false });
    assert.equal(header.querySelector('[aria-label=Close]'), close); assert.ok(header.querySelector('[aria-label=Restore]'));
    header.querySelector('[aria-label=Minimize]').click(); assert.equal(calls.length, 4);
    assert.equal(header.dataset.focused, 'false');
    s.themes.register({ id: 'test.window', name: 'Window', properties: { appearance: 'light', colors: { background: '#dddddd', panel: '#eeeeee' } } }, s.ctx.signal);
    s.themes.select('test.window'); assert.equal(header.style.getPropertyValue('--vault-panel'), '#eeeeee');
    assert.equal(header.querySelector('[aria-label=Close]'), close);
    const root = header.closest('.lm-root');
    assert.equal(root.style.backgroundColor, 'rgb(221, 221, 221)');
    assert.equal(s.dom.window.getComputedStyle(header).margin, '0px');
    assert.equal(s.dom.window.getComputedStyle(header).borderRadius, '0px');
    mounted.value.update({ ...props, presentation: { mode: 'embedded', sizing: 'content' } });
    assert.equal(root.style.backgroundColor, 'transparent', 'An explicitly embedded caption must inherit its container surface.');
    mounted.value.update(props); assert.equal(root.style.backgroundColor, 'rgb(221, 221, 221)');
    assert.equal(mounted.value.update({ ...props, onClose: null }).ok, false);
  } finally { await s.stop(); }
});

test('status role escapes names, preserves its root across theme changes and owns no outer surface', async () => {
 const s = await setup(); await s.start();
 try {
  const props = { label: 'Document status', filename: '<script>name</script>', fileTitle: 'folder/name.md', serverLabel: 'Server offline', serverTitle: 'https://notes.example', serverState: 'offline', words: 1, letters: 4, wordsLabel: 'Words: 1', lettersLabel: 'Letters: 4' };
  const mounted = s.components.mount('lunaris.status-bar', s.target, props, s.ctx.signal); assert.equal(mounted.ok, true);
  const footer = s.target.querySelector('footer'); assert.ok(footer); assert.equal(footer.querySelector('script'), null); assert.ok(footer.textContent.includes('<script>name</script>')); assert.equal(footer.querySelector('.lm-status-counts').textContent, '14'); assert.equal(footer.querySelectorAll('svg').length, 3); assert.ok(!footer.textContent.includes('Words:')); assert.equal(footer.querySelector('.lm-status-server').title, 'Server offline: https://notes.example'); assert.equal(footer.closest('.lm-root').style.flex, '1 1 auto');
  const sheet = s.dom.window.document.createElement('style');
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  sheet.textContent = css.slice(css.indexOf('.lm-status-bar {')); s.dom.window.document.head.append(sheet);
  const computed = s.dom.window.getComputedStyle;
  assert.equal(computed(footer).display, 'flex'); assert.equal(computed(footer).flexWrap, 'nowrap');
  assert.equal(computed(footer.querySelector('.lm-status-counts')).display, 'flex');
  assert.equal(computed(footer.querySelector('.lm-status-counts')).flexWrap, 'nowrap');
  assert.equal(computed(footer.querySelector('.lm-status-counts')).marginInlineStart, 'auto');
  mounted.value.update({ ...props, filename: 'Very long document '.repeat(20), words: 0, letters: 0, wordsLabel: 'Words: 0', lettersLabel: 'Letters: 0' });
  assert.equal(footer.querySelector('.lm-status-counts').textContent, '00');
  assert.equal(computed(footer).flexWrap, 'nowrap');
  assert.equal(footer.style.backgroundColor, ''); assert.equal(footer.closest('.lm-root').dataset.sizing, 'content'); assert.equal(footer.querySelectorAll('button,input').length, 0);
  mounted.value.update({ ...props, filename: 'Updated', serverLabel: '', serverState: null, words: null, letters: null, wordsLabel: '', lettersLabel: '' }); assert.equal(s.target.querySelector('footer'), footer); assert.equal(footer.querySelector('.lm-status-counts'), null);
  assert.equal(footer.querySelector('.lm-status-server'), null);
  assert.equal(s.components.mount('lunaris.status-bar', s.target, { ...props, wordsLabel: 2 }, s.ctx.signal).ok, false);
 } finally { await s.stop(); }
});

test('callout header owns themed Mantine disclosure and preserves focus, escaping and props on updates',async()=>{
 const s=await setup();await s.start();let toggles=0,edits=0;
 const props={title:'<script>Title</script>',kind:'warning',foldable:true,collapsed:true,toggleLabel:'Toggle',editLabel:'Edit',onToggle(){toggles++;},onEdit(){edits++;}};
 const mounted=s.components.mount('lunaris.callout-header',s.target,props,s.ctx.signal);assert.equal(mounted.ok,true);
 const root=s.target.querySelector('.lm-callout-header'),toggle=root.querySelector('[aria-expanded]'),title=root.querySelector('.lm-callout-title');
 assert.equal(root.querySelector('script'),null);assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(root.closest('.lm-root').dataset.presentation,'embedded');
 toggle.focus();toggle.click();assert.equal(toggles,1);mounted.value.update({...props,collapsed:false,title:'Localized title'});assert.equal(root.querySelector('[aria-expanded]'),toggle);assert.equal(s.dom.window.document.activeElement,toggle);assert.equal(toggle.getAttribute('aria-expanded'),'true');
 title.click();assert.equal(edits,1);assert.equal(mounted.value.update({...props,kind:'invalid'}).ok,false);
 mounted.value.dispose();await s.stop();
});

test('callout title stays plain, has the note pencil icon and no native edit tooltip',async()=>{
 const s=await setup();await s.start();
 try {
  const sheet=s.dom.window.document.createElement('style');sheet.textContent=readFileSync(new URL('../styles.css',import.meta.url),'utf8').replace(/^@import .*$/gm,'');s.dom.window.document.head.append(sheet);
  const props={title:'Note title',kind:'note',foldable:false,collapsed:false,toggleLabel:'Toggle',editLabel:'Edit',onToggle(){},onEdit(){}};
  const mounted=s.components.mount('lunaris.callout-header',s.target,props,s.ctx.signal);assert.equal(mounted.ok,true);
  const title=s.target.querySelector('.lm-callout-title');assert.equal(title.hasAttribute('title'),false);
  const paths=[...title.querySelectorAll('svg path')].map(path=>path.getAttribute('d'));
  assert.deepEqual(paths,Pencil.filter(([tag])=>tag==='path').map(([,attributes])=>attributes.d));
  const style=s.dom.window.getComputedStyle(title);assert.equal(style.backgroundColor,'rgba(0, 0, 0, 0)');assert.equal(style.boxShadow,'none');assert.equal(style.fontWeight,'600');assert.equal(style.cursor,'text');
  mounted.value.dispose();
 } finally { await s.stop(); }
});

test('Workspace leaves Tab and Shift+Tab to embedded controls and sibling views', async () => {
 const s=await setup(); await s.start(); let targets;
 const mounted=s.components.mount('lunaris.workspace-layout',s.target,{railVisible:true,panelVisible:true,mainLabel:'Main',panelLabel:'Panel',onTargets:value=>{targets=value;},onDismiss(){}},s.ctx.signal);
 assert.equal(mounted.ok,true); assert.ok(targets);
 const sibling=s.dom.window.document.createElement('input'); s.target.append(sibling);
 const input=s.dom.window.document.createElement('input'); targets.main.append(input);
 for(const target of [sibling,input]) for(const shiftKey of [false,true]) {
   const event=new s.dom.window.KeyboardEvent('keydown',{key:'Tab',shiftKey,bubbles:true,cancelable:true}); target.dispatchEvent(event); assert.equal(event.defaultPrevented,false);
 }
 sibling.remove(); await s.stop();
});

test('editor recovery choices use public themed actions without selecting a candidate implicitly',async()=>{
 const s=await setup();await s.start();const chosen=[];
 const props={documentKey:'note',name:'note.md',status:'',error:'Conflict',ready:true,dirty:false,busy:false,saveLabel:'Save',retryLabel:'Retry',reloadLabel:'Reload',discardLabel:'Discard',cancelLabel:'Cancel',onSave(){},onReload(){},onTarget(){},recoveryLabel:'Choose draft',recoveryCandidates:[{id:'a',label:'First <draft>'},{id:'b',label:'Second draft'}],onRecovery:id=>chosen.push(id),presentation:{mode:'embedded',sizing:'fill'}};
 assert.equal(s.components.mount('lunaris.text-editor',s.target,props,s.ctx.signal).ok,true);
 const group=s.target.querySelector('[role=group][aria-label="Choose draft"]');assert.ok(group);assert.deepEqual(chosen,[]);assert.equal(group.querySelector('draft'),null);
 group.querySelectorAll('button')[1].click();assert.deepEqual(chosen,['b']);await s.stop();
});
