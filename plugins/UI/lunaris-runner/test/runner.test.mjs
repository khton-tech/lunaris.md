import { useBrowser } from '../../../../tools/test/browser.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { definePlugin } from '@lunaris/sdk';
import { TestScheduler } from '@lunaris/test';
import { Config } from '@lunaris/config';
import { Logger } from '@lunaris/logging';
import { Themes } from '@lunaris/themes';
import { Localization } from '@lunaris/localization';
import { Components } from '@lunaris/components';
import localizationManager from '@lunaris/localization-manager';
import componentsProvider from '@lunaris/component-provider';
import kit from '@lunaris/mantine-components';
import themeProvider from '@lunaris/theme-provider';
import baseTheme from '@lunaris/base-theme-engine';
import { createThemeSettings } from '@lunaris/theme-settings';
import { createStartupProvider } from '@lunaris/startup-provider';
import { createRunner } from '@lunaris/runner';
import { HostSession } from '@lunaris/tauri';
import { composeSlotSurface } from '../../../../hosts/tauri/dist/slots.js';

const art = readFileSync(new URL('../../../../resources/ascii_art.txt', import.meta.url), 'utf8');
const manifest = (id, provides = [], requires = [], permissions = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides, requires, permissions, optionalPermissions: [] });
const flush = () => new Promise(resolve => setImmediate(resolve));

function setup(options = {}) {
  const dom = useBrowser(new JSDOM('<div id="app"></div>')); const surface = dom.window.document.getElementById('app');
  const logs = []; const reads = []; const slowEntered = Promise.withResolvers(); const finish = Promise.withResolvers();
  let tools; let controller; let context;
  const logger = definePlugin({ manifest: manifest('test.logger', [{ kind: 'api', id: Logger.id, version: Logger.version }]), activate(ctx) {
    ctx.provide(Logger, Object.fromEntries(['log','debug','info','warn','error'].map(level => [level, (...args) => { logs.push([level, ...args]); return true; }])));
  } });
  const config = definePlugin({ manifest: manifest('test.config', [{ kind: 'api', id: Config.id, version: Config.version }]), activate(ctx) {
    ctx.provide(Config, { read: async id => {
      reads.push(id);
      if (id === 'lunaris.runner') {
        await options.beforeRead?.();
        return options.readResult ?? { ok: true, value: options.runnerSettings ?? {} };
      }
      return { ok: true, value: options.theme ? { theme: options.theme } : {} };
    }, get() {}, set() {}, remove() {} });
  } });
  const toolPlugin = definePlugin({ manifest: manifest('test.tools', [], [Components, Themes, Localization].map(token => ({ kind: 'api', id: token.id, range: '^1.0.0' })), ['ui.dom']), activate(ctx) {
    context = ctx; tools = { components: ctx.use(Components), themes: ctx.use(Themes), localization: ctx.use(Localization) };
  } });
  const slow = definePlugin({ manifest: manifest('test.slow'), async activate() { slowEntered.resolve(); await finish.promise; if (options.fail) throw Error('private failure'); } });
  const runner = createRunner({ art }); const settings = createThemeSettings({ defaultThemeId: 'lunaris.base-theme-engine.monochrome' });
  const scheduler = new TestScheduler();
  const session = new HostSession({ scheduler, load: async () => {
    controller = createStartupProvider(); const layout = composeSlotSurface(surface);
    return { ...layout, startup: controller,
      plugins: [logger, config, localizationManager, componentsProvider, kit, themeProvider, baseTheme, settings, runner, controller.plugin, toolPlugin, slow, ...layout.plugins],
      entrypoints: [controller.plugin.manifest.id, baseTheme.manifest.id, ...(options.noKit ? [] : [kit.manifest.id]), settings.manifest.id, runner.manifest.id, 'test.tools', 'test.slow'],
      grants: { ...layout.grants, [componentsProvider.manifest.id]: ['ui.dom'], [kit.manifest.id]: ['ui.dom'],
        [settings.manifest.id]: ['config.access'], [runner.manifest.id]: options.denied ? ['ui.dom'] : ['ui.dom','config.access'], 'test.tools': ['ui.dom'] },
    };
  } });
  const starting = session.start();
  return { dom, surface, session, scheduler, logs, reads, starting, finish, slowEntered,
    get tools() { return tools; }, get context() { return context; }, get controller() { return controller; } };
}

test('runner renders supplied ASCII art, real milestones and configured theme, then stays at System Loaded', async () => {
  const s = setup({ theme: 'lunaris.base-theme-engine.monochrome' }); await s.slowEntered.promise;
  assert.equal(s.session.snapshot().phase, 'starting'); assert.equal(s.session.snapshot().applicationVisible, true);
  assert.equal(s.surface.querySelector('pre').textContent, art);
  assert.equal(s.surface.querySelector('[role=status]').textContent, 'Loading system'); assert.match(s.surface.textContent, /Starting test.slow/);
  assert.equal(s.surface.querySelector('section').closest('.lm-root').style.backgroundColor, 'rgb(15, 15, 15)');
  assert.equal(s.surface.querySelector('pre').style.fontSize, '10px');
  assert.deepEqual(s.reads, ['lunaris.theme-settings','lunaris.runner']);
  s.finish.resolve(); await s.starting;
  assert.equal(s.surface.querySelector('[role=status]').textContent, 'System Loaded');
  assert.equal(s.surface.querySelector('section').lastElementChild.hidden, true);
  const html = s.surface.innerHTML; s.session.refresh(); assert.equal(s.surface.innerHTML, html); assert.equal(s.scheduler.pending, 0);
  assert.ok(s.logs.some(log => log[3]?.code === 'RUNNER_LOADED'));
  await s.session.stop(); assert.equal(s.surface.childElementCount, 0); s.dom.window.close();
});

test('no runner content is mounted before its settings read completes; details can be disabled', async () => {
  const entered = Promise.withResolvers(); const release = Promise.withResolvers();
  const s = setup({ runnerSettings: { showDetails: false }, beforeRead: () => { entered.resolve(); return release.promise; } });
  await entered.promise; assert.equal(s.surface.querySelector('section'), null);
  release.resolve(); await s.slowEntered.promise;
  assert.equal(s.surface.querySelector('section').lastElementChild.hidden, true);
  assert.equal(s.surface.querySelector('section').closest('.lm-root').style.backgroundColor, 'rgb(15, 15, 15)');
  s.finish.resolve(); await s.starting; await s.session.stop(); s.dom.window.close();
});

test('invalid settings, read failure and denied config access leave a clean host fallback', async () => {
  for (const options of [{ runnerSettings: { showDetails: 'yes' } }, { readResult: { ok: false, error: { code: 'INVALID_TOML', message: 'Invalid config' } } }, { denied: true }]) {
    const s = setup(options); await s.starting;
    assert.equal(s.session.snapshot().phase, 'fallback'); assert.equal(s.surface.childElementCount, 0);
    assert.ok(s.logs.some(log => log[3]?.code === 'RUNNER_ACTIVATION_FAILED' && log[3].error instanceof Error));
    await s.session.stop(); s.dom.window.close();
  }
});

test('missing component can register later, be replaced, and render the latest loaded status', async () => {
  const s = setup({ noKit: true }); await s.slowEntered.promise;
  assert.equal(s.surface.querySelector('section'), null);
  s.finish.resolve(); await s.starting;
  const owner = new AbortController();
  function register(signal) {
    return s.tools.components.register({ id: 'lunaris.startup-screen', mount(target, props) {
      const node = target.ownerDocument.createElement('p'); node.textContent = props.status; target.append(node);
      return { update(next) { node.textContent = next.status; }, dispose() { node.remove(); } };
    } }, signal);
  }
  assert.equal(register(owner.signal).ok, true); await flush(); assert.match(s.surface.textContent, /System Loaded/);
  owner.abort(); await flush(); assert.equal(s.surface.querySelector('p'), null);
  assert.equal(register(s.context.signal).ok, true); await flush(); assert.match(s.surface.textContent, /System Loaded/);
  await s.session.stop(); assert.equal(s.surface.childElementCount, 0); s.dom.window.close();
});

test('theme and locale changes refresh the loaded screen, and older milestones are ignored', async () => {
  const s = setup(); await s.slowEntered.promise; s.finish.resolve(); await s.starting;
  assert.equal(s.tools.themes.register({ id: 'test.alternate', name: 'Alternate', properties: { colors: { background: '#FFFFFF' } } }, s.context.signal).ok, true);
  s.tools.themes.select('test.alternate');
  assert.equal(s.surface.querySelector('section').closest('.lm-root').style.backgroundColor, 'rgb(255, 255, 255)');
  // Replace the English-first catalog through its public registration contract.
  // A separate catalog adds locale availability; absent runner translations fall back to English.
  s.tools.localization.register('test.languages', { en: { name: 'Language' }, fr: { name: 'Langue' } }, s.context.signal);
  assert.equal(s.tools.localization.setLocale('fr').ok, true); await flush();
  assert.equal(s.surface.querySelector('[role=status]').textContent, 'System Loaded');
  assert.equal(s.controller.update({ sequence: 1, state: 'loading', stage: 'composition' }), false);
  assert.equal(s.surface.querySelector('[role=status]').textContent, 'System Loaded');
  await s.session.stop(); s.dom.window.close();
});

test('activation failure after runner startup cleans the screen, and retry creates fresh content', async () => {
  const options = { fail: true };
  const s = setup(options); await s.slowEntered.promise; const old = s.surface.querySelector('section');
  s.finish.resolve(); await s.starting;
  assert.equal(s.session.snapshot().phase, 'fallback'); assert.equal(old.isConnected, false);
  assert.equal(s.surface.childElementCount, 0);
  options.fail = false; await s.session.start(); assert.equal(s.session.snapshot().phase, 'running');
  assert.notEqual(s.surface.querySelector('section'), old);
  assert.equal(s.surface.querySelector('[role=status]').textContent, 'System Loaded');
  assert.ok(!s.session.snapshot().kernel.diagnostics.some(item => item.code === 'CLEANUP_FAILED'));
  await s.session.stop(); s.dom.window.close();
});

test('a late rendering failure is diagnosed locally and a replacement renderer recovers without stopping the host', async () => {
  const s = setup({ noKit: true }); await s.slowEntered.promise; s.finish.resolve(); await s.starting;
  const broken = new AbortController();
  s.tools.components.register({ id: 'lunaris.startup-screen', mount() { throw Error('Renderer failed'); } }, broken.signal);
  await flush(); s.session.refresh(); await flush();
  assert.equal(s.session.snapshot().phase, 'running');
  assert.ok(s.session.snapshot().kernel.diagnostics.some(item => item.code === 'EVENT_LISTENER_FAILED' && item.pluginId === 'lunaris.runner'));
  assert.ok(s.logs.some(log => log[3]?.code === 'RUNNER_RENDER_FAILED' && log[3].error.cause.code === 'RENDER_FAILED'));
  broken.abort(); await flush();
  s.tools.components.register({ id: 'lunaris.startup-screen', mount(target, props) {
    const node = target.ownerDocument.createElement('p'); node.textContent = props.status; target.append(node);
    return { update(next) { node.textContent = next.status; }, dispose() { node.remove(); } };
  } }, s.context.signal);
  await flush(); assert.match(s.surface.textContent, /System Loaded/);
  assert.equal(s.session.snapshot().phase, 'running');
  await s.session.stop(); s.dom.window.close();
});
