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
