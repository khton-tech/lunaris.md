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

const manifest = (id, provides = [], requires = [], permissions = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides, requires, permissions, optionalPermissions: [] });
async function setup() {
  const dom = useBrowser(new JSDOM('<div id="target"><span>Sibling</span></div>'));
  const target = dom.window.document.getElementById('target'); const logs = [];
  let components; let themes; let ctx;
  const logger = definePlugin({ manifest: manifest('test.logger', [{ kind: 'api', id: Logger.id, version: Logger.version }]), activate(context) {
    context.provide(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, (...args) => { logs.push([level, ...args]); return true; }])));
  } });
  const consumer = definePlugin({ manifest: manifest('test.consumer', [], [Components, Themes].map(token => ({ kind: 'api', id: token.id, range: '^1.0.0' })), ['ui.dom']), activate(context) {
    ctx = context; components = ctx.use(Components); themes = ctx.use(Themes);
  } });
  const kernel = createKernel({ scheduler: new TestScheduler() });
  for (const item of [logger, componentProvider, themeProvider, plugin, consumer]) kernel.register(item);
  for (const id of [componentProvider.manifest.id, plugin.manifest.id, consumer.manifest.id]) kernel.grant(id, 'ui.dom');
  await kernel.start(consumer.manifest.id);
  return { dom, target, logs, kernel, components, themes, ctx, async start() { await kernel.start(plugin.manifest.id); }, async stop() {
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

test('registers the replaceable roles, renders real Mantine controls, preserves siblings and releases roots', async () => {
  const s = await setup(); await s.start();
  assert.deepEqual(s.components.list(), ['lunaris.startup-screen', 'lunaris.vault-selector']);
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
