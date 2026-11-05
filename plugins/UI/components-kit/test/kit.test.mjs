import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createKernel } from '@lunaris/kernel';
import { definePlugin } from '@lunaris/sdk';
import { TestScheduler } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Components } from '@lunaris/components';
import { Themes } from '@lunaris/themes';
import componentsProvider from '@lunaris/component-provider';
import themeProvider from '@lunaris/theme-provider';
import kit from '@lunaris/components-kit';

const manifest = (id, provides = [], requires = [], permissions = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides, requires, permissions, optionalPermissions: [] });
async function setup() {
  const dom = new JSDOM('<div id="target"><span>Sibling</span></div>');
  const target = dom.window.document.getElementById('target'); const logs = [];
  const logger = definePlugin({ manifest: manifest('test.logger', [{ kind: 'api', id: Logger.id, version: Logger.version }]), activate(ctx) {
    ctx.provide(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(name => [name, (...args) => { logs.push(args); return true; }])));
  } });
  let components; let themes; let owner;
  const consumer = definePlugin({ manifest: manifest('test.consumer', [], [Components, Themes].map(token => ({ kind: 'api', id: token.id, range: '^1.0.0' })), ['ui.dom']), activate(ctx) {
    components = ctx.use(Components); themes = ctx.use(Themes); owner = ctx.signal;
  } });
  const kernel = createKernel({ scheduler: new TestScheduler() });
  for (const plugin of [logger, componentsProvider, themeProvider, kit, consumer]) kernel.register(plugin);
  for (const id of [componentsProvider.manifest.id, kit.manifest.id, 'test.consumer']) kernel.grant(id, 'ui.dom');
  await kernel.start(kit.manifest.id); await kernel.start('test.consumer');
  return { dom, target, logs, kernel, components, themes, owner };
}
const props = { art: '██ LUNARIS', logoLabel: 'Lunaris', status: 'System loaded' };
const selectorProps = {
  art: 'ASCII', text: { logo: 'Lunaris', recent: 'Recent', empty: 'Empty', create: 'Create', select: 'Select', folder: 'Folder', folderPlaceholder: 'Choose folder', browse: 'Browse', name: 'Name', next: 'Next', retry: 'Retry' },
  mode: 'create', folder: 'Notes', name: 'My Notes', busy: false, canContinue: true, error: '', historyError: '', status: '',
  entries: [{ reference: 'saved', name: '<img src=x>', label: 'Folder' }],
  onMode() {}, onName() {}, onBrowse() {}, onNext() {}, onRecent() {}, onRetry() {},
};

test('selector action and submit buttons retain shared control layout when specialized', async () => {
  const s = await setup();
  const mounted = s.components.mount('lunaris.vault-selector', s.target, selectorProps, s.owner); assert.equal(mounted.ok, true);
  for (const control of s.target.querySelectorAll('.ln-vault-toggle, .ln-vault-next')) {
    const style = s.dom.window.getComputedStyle(control);
    assert.equal(style.display, 'flex', 'Action icons and text must share the kit flex layout.');
    assert.equal(style.borderTopWidth, '0px', 'Actions must not fall back to native button borders.');
    assert.equal(style.textAlign, 'start', 'Action text must align with the form rather than native centered buttons.');
  }
  await s.kernel.stopAll(); s.dom.window.close();
});

test('selector supplies accessible Lucide controls, preserves form identity on updates and releases only owned DOM', async () => {
  const s = await setup();
  const mounted = s.components.mount('lunaris.vault-selector', s.target, selectorProps, s.owner); assert.equal(mounted.ok, true);
  const form = s.target.querySelector('form:not([inert])'); const name = form.querySelector('input:not([readonly])');
  const toggle = s.target.querySelector('[aria-expanded=true]');
  assert.equal(toggle.getAttribute('aria-controls'), form.id);
  const browse = form.querySelector('button[aria-label=Browse]');
  assert.equal(browse.title, 'Browse'); assert.equal(browse.querySelector('svg').getAttribute('aria-hidden'), 'true');
  assert.equal(s.target.querySelector('img'), null); assert.match(s.target.textContent, /<img src=x>/);
  assert.equal(mounted.value.update({ ...selectorProps, name: 'Edited' }).ok, true);
  assert.equal(s.target.querySelector('form:not([inert]) input:not([readonly])'), name); assert.equal(name.value, 'Edited');
  assert.equal(mounted.value.update({ ...selectorProps, entries: [null] }).error.code, 'RENDER_FAILED'); assert.equal(name.value, 'Edited');
  mounted.value.dispose(); assert.equal(s.target.innerHTML, '<span>Sibling</span>');
  await s.kernel.stopAll(); s.dom.window.close();
});

test('selector follows arbitrary theme updates and resets; multiple instances have unique form associations', async () => {
  const s = await setup();
  const first = s.components.mount('lunaris.vault-selector', s.target, selectorProps, s.owner); assert.equal(first.ok, true);
  const second = s.components.mount('lunaris.vault-selector', s.target, selectorProps, s.owner); assert.equal(second.ok, true);
  assert.equal(new Set([...s.target.querySelectorAll('form')].map(f => f.id)).size, 4);
  const theme = { id: 'test.any', name: 'Independent theme', properties: { colors: { background: '#123456', accent: '#abcdef', onAccent: '#101010' }, geometry: { unit: 'px', spacing: { step: 6 }, radius: { medium: 9 } }, typography: { fontFamily: ['serif'], fontSize: 18 }, motion: { fast: 0, normal: 350, easing: 'linear' } } };
  s.themes.register(theme, s.owner); s.themes.select(theme.id);
  for (const screen of s.target.querySelectorAll('.ln-vault')) {
    assert.equal(screen.style.getPropertyValue('--vault-background'), '#123456'); assert.equal(screen.style.getPropertyValue('--vault-space'), '6px');
    assert.equal(screen.style.getPropertyValue('--vault-font'), 'serif'); assert.equal(screen.style.getPropertyValue('--vault-radius'), '9px');
    assert.equal(screen.style.getPropertyValue('--vault-motion-fast'), '0ms'); assert.equal(screen.style.getPropertyValue('--vault-motion-normal'), '350ms');
  }
  s.themes.select(null);
  assert.equal(s.target.querySelector('.ln-vault').style.getPropertyValue('--vault-background'), 'transparent');
  assert.equal(s.target.querySelector('.ln-vault').style.getPropertyValue('--vault-font'), 'inherit');
  assert.equal(s.target.querySelector('.ln-vault').style.getPropertyValue('--vault-motion-fast'), '120ms');
  await s.kernel.stopAll(); assert.equal(s.target.innerHTML, '<span>Sibling</span>'); s.dom.window.close();
});

test('kit renders localized text safely through component roles and releases only owned content', async () => {
  const { dom, target, kernel, components, owner } = await setup();
  const mounted = components.mount('lunaris.startup-screen', target, props, owner);
  assert.equal(mounted.ok, true); assert.equal(target.querySelector('pre').getAttribute('aria-label'), 'Lunaris');
  assert.equal(target.querySelector('[role=status]').textContent, 'System loaded');
  assert.equal(mounted.value.update({ ...props, status: '<img src=x>', detail: 'Загрузка настроек' }).ok, true);
  assert.equal(target.querySelector('img'), null); assert.match(target.textContent, /Загрузка настроек/);
  assert.equal(mounted.value.update({ ...props, art: 7 }).error.code, 'RENDER_FAILED');
  assert.equal(target.querySelector('[role=status]').textContent, '<img src=x>');
  mounted.value.dispose(); assert.equal(target.innerHTML, '<span>Sibling</span>');
  await kernel.stopAll(); dom.window.close();
});

test('selection, theme updates and clearing restyle live instances without a specific engine', async () => {
  const { dom, target, kernel, components, themes, owner } = await setup();
  const mounted = components.mount('lunaris.startup-screen', target, props, owner); assert.equal(mounted.ok, true);
  const theme = { id: 'test.theme', name: 'Any compatible engine', properties: {
    colors: { background: '#111111', text: '#eeeeee', textSecondary: '#aaaaaa' },
    geometry: { unit: 'px', spacing: { step: 5 } },
    typography: { fontFamily: ['serif'], monoFontFamily: ['monospace'], fontSize: 18, fontSizeUnit: 'px', lineHeight: 1.7 },
  } };
  assert.equal(themes.register(theme, owner).ok, true); themes.select(theme.id);
  const screen = target.querySelector('section');
  assert.equal(screen.style.backgroundColor, 'rgb(17, 17, 17)'); assert.equal(screen.style.fontSize, '18px');
  assert.equal(screen.style.padding, '20px'); assert.equal(screen.style.fontFamily, 'serif');
  themes.update({ ...theme, properties: { ...theme.properties, components: { startupScreen: {
    padding: 28, gap: 20, logoFontSize: 11, logoLineHeight: 1.2, statusFontWeight: 600,
  } } } });
  assert.equal(screen.style.padding, '28px'); assert.equal(screen.style.gap, '20px');
  assert.equal(target.querySelector('pre').style.fontSize, '11px');
  assert.equal(target.querySelector('[role=status]').style.fontWeight, '600');
  themes.update({ ...theme, properties: { colors: { text: '#123456' } } });
  assert.equal(screen.style.color, 'rgb(18, 52, 86)'); assert.equal(screen.style.fontSize, 'inherit');
  assert.equal(target.querySelector('pre').style.fontSize, 'inherit');
  themes.select(null); assert.equal(screen.style.color, 'inherit'); assert.equal(screen.style.backgroundColor, 'transparent');
  await kernel.stopAll(); dom.window.close();
});

test('owner cancellation and kit shutdown dispose instances; roles can be replaced without stale DOM', async () => {
  const { dom, target, kernel, components, owner, logs } = await setup();
  const external = new AbortController();
  const first = components.mount('lunaris.startup-screen', target, props, external.signal); assert.equal(first.ok, true);
  external.abort(); assert.equal(target.querySelector('section'), null);
  const second = components.mount('lunaris.startup-screen', target, props, owner); assert.equal(second.ok, true);
  await kernel.stop(kit.manifest.id);
  assert.equal(target.querySelector('section'), null); assert.equal(components.has('lunaris.startup-screen'), false);
  assert.equal(second.value.update(props).error.code, 'NOT_FOUND');
  await kernel.start(kit.manifest.id); assert.equal(components.has('lunaris.startup-screen'), true);
  assert.equal(components.mount('lunaris.startup-screen', target, { ...props, status: 42 }, owner).error.code, 'RENDER_FAILED');
  assert.equal(target.querySelector('section'), null);
  assert.ok(logs.some(args => args[2]?.code === 'SCREEN_MOUNT_FAILED' && args[2].error instanceof Error));
  await kernel.stopAll(); dom.window.close();
});
