import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { definePlugin } from '@lunaris/sdk';
import { TestScheduler } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Config } from '@lunaris/config';
import { Components } from '@lunaris/components';
import { Themes } from '@lunaris/themes';
import { Localization } from '@lunaris/localization';
import { Vault, VaultLocations, VaultChanged, VaultHistory, VaultHistoryChanged } from '@lunaris/vault';
import { createVaultSelector } from '@lunaris/vault-selector';
import { createRunner } from '@lunaris/runner';
import { createStartupProvider } from '@lunaris/startup-provider';
import localization from '@lunaris/localization-manager';
import componentProvider from '@lunaris/component-provider';
import kit from '@lunaris/components-kit';
import themes from '@lunaris/theme-provider';
import baseTheme from '@lunaris/base-theme-engine';
import { HostSession } from '@lunaris/tauri';
import { composeSlotSurface } from '../../../../hosts/tauri/dist/slots.js';

const ok = value => ({ ok: true, value });
const fail = code => ({ ok: false, error: { code, message: code } });
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
const deferred = () => Promise.withResolvers();
const manifest = (id, tokens = [], required = [], permissions = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js',
  provides: tokens.map(t => ({ kind: t.kind, id: t.id, version: t.version })), requires: required.map(t => ({ kind: t.kind, id: t.id, range: `^${t.version}` })), permissions, optionalPermissions: [] });
const location = { reference: 'saved-folder', label: 'Selected folder' };

function setup(options = {}) {
  const dom = new JSDOM('<div id="app"></div>'); const surface = dom.window.document.getElementById('app');
  const finish = deferred(); const entered = deferred(); const logs = []; const selections = []; const calls = [];
  let current = null; let entries = options.entries ?? []; let tools; let context;
  const logger = definePlugin({ manifest: manifest('test.logger', [Logger]), activate(ctx) {
    ctx.provide(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, (...args) => { logs.push([level, ...args]); return true; }])));
  } });
  const config = definePlugin({ manifest: manifest('test.config', [Config]), activate(ctx) { ctx.provide(Config, { async read() { return ok({}); }, async get() { return ok(undefined); }, async set() { return ok(null); }, async remove() { return ok(false); } }); } });
  const services = definePlugin({ manifest: manifest('test.vaults', [Vault, VaultLocations, VaultChanged, VaultHistory, VaultHistoryChanged]), activate(ctx) {
    async function open(folder, input) {
      calls.push({ operation: 'open', folder, input }); await options.beforeOpen?.();
      if (options.openFailure) return fail(options.openFailure);
      const previous = current; current = { id: `vault-${calls.length}`, name: input?.name ?? 'Stored name' };
      await ctx.events.emit(VaultChanged, { kind: previous ? 'switched' : 'opened', previous, current, location: folder });
      entries = [{ location: folder, name: current.name }, ...entries.filter(e => e.location.reference !== folder.reference)];
      await ctx.events.emit(VaultHistoryChanged, { entries });
      return ok(current);
    }
    ctx.provide(Vault, { current: () => current, open: () => open(location), async close() { current = null; return ok(null); } });
    ctx.provide(VaultLocations, { async select() { calls.push({ operation: 'select' }); return selections.length ? await selections.shift() : ok(location); }, open });
    ctx.provide(VaultHistory, { async list() { return options.historyFailure ? fail('HISTORY_UNAVAILABLE') : ok(entries); }, async open(reference) {
      calls.push({ operation: 'recent', reference }); const entry = entries.find(e => e.location.reference === reference);
      return entry ? open(entry.location) : fail('NOT_FOUND');
    } });
  } });
  const toolPlugin = definePlugin({ manifest: manifest('test.tools', [], [Components, Themes, Localization], ['ui.dom']), activate(ctx) {
    context = ctx; tools = { components: ctx.use(Components), themes: ctx.use(Themes), localization: ctx.use(Localization) };
    tools.themes.select('lunaris.base-theme-engine.dark');
  } });
  const slow = definePlugin({ manifest: manifest('test.slow'), async activate() { entered.resolve(); await finish.promise; } });
  const startup = createStartupProvider(); const runner = createRunner({ art: 'ASCII LOGO', hideWhenLoaded: true }); const selector = createVaultSelector({ art: 'ASCII LOGO' });
  const layout = composeSlotSurface(surface);
  const session = new HostSession({ scheduler: new TestScheduler(), load: async () => ({ ...layout, startup,
    plugins: [logger, config, services, localization, componentProvider, kit, themes, baseTheme, toolPlugin, startup.plugin, runner, selector, slow, ...layout.plugins],
    entrypoints: [startup.plugin.manifest.id, baseTheme.manifest.id, ...(options.noKit ? [] : [kit.manifest.id]), 'test.tools', runner.manifest.id, selector.manifest.id, 'test.slow'],
    grants: { ...layout.grants, [componentProvider.manifest.id]: ['ui.dom'], [kit.manifest.id]: ['ui.dom'], 'test.tools': ['ui.dom'],
      [runner.manifest.id]: ['ui.dom', 'config.access'], [selector.manifest.id]: options.denied ? ['ui.dom'] : ['ui.dom', 'vault.access'] },
  }) });
  const starting = session.start();
  return { dom, surface, finish, entered, starting, session, logs, calls, selections, get tools() { return tools; }, get context() { return context; },
    async ready() { await entered.promise; finish.resolve(); await starting; await flush(); },
    async stop() { await session.stop(); assert.equal(surface.childElementCount, 0); dom.window.close(); },
  };
}
const find = (s, label) => [...s.surface.querySelectorAll('button')].find(button => button.textContent.trim() === label || button.getAttribute('aria-label') === label);

test('host hands off runner to the two-panel selector only after loaded, without opening dialogs', async () => {
  const s = setup(); await s.entered.promise;
  assert.equal(s.surface.querySelector('.ln-vault'), null); assert.match(s.surface.textContent, /Loading system/);
  s.finish.resolve(); await s.starting; await flush();
  assert.equal(s.surface.querySelectorAll('section').length, 1); assert.ok(s.surface.querySelector('.ln-vault'));
  assert.equal(s.surface.querySelector('pre').textContent, 'ASCII LOGO'); assert.equal(s.surface.querySelector('[data-slot-id="lunaris.runner.screen"]'), null);
  assert.equal(s.surface.querySelector('.ln-vault-recents').nextElementSibling.className, 'ln-vault-main');
  assert.equal(find(s, 'Create vault').getAttribute('aria-expanded'), 'false'); assert.ok(find(s, 'Select vault'));
  assert.match(s.surface.textContent, /No recent vaults/); assert.deepEqual(s.calls, []);
  assert.equal(s.logs.some(log => log[3]?.code === 'PARAMETER_MISSING'), false);
  await s.stop();
});

test('create card browses without opening, requires a name and submits once through SDK before displaying success/history', async () => {
  const pending = deferred(); const s = setup({ beforeOpen: () => pending.promise }); await s.ready();
  find(s, 'Create vault').click();
  let form = [...s.surface.querySelectorAll('form')].find(form => !form.hidden);
  assert.equal(find(s, 'Create vault').getAttribute('aria-expanded'), 'true');
  assert.equal(form.querySelector('[type=submit]').disabled, true);
  assert.equal(form.querySelector('button[aria-label=Browse]'), s.dom.window.document.activeElement);
  form.querySelector('button[aria-label=Browse]').click(); await flush();
  assert.deepEqual(s.calls.map(c => c.operation), ['select']); assert.equal(form.querySelector('input[readonly]').value, location.label);
  const name = form.querySelector('input:not([readonly])'); name.value = 'My Notes'; name.dispatchEvent(new s.dom.window.Event('input', { bubbles: true }));
  assert.equal(form.querySelector('[type=submit]').disabled, false);
  form.dispatchEvent(new s.dom.window.Event('submit', { bubbles: true, cancelable: true }));
  form.dispatchEvent(new s.dom.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(s.calls.filter(c => c.operation === 'open').length, 1); assert.equal(name.disabled, true);
  pending.resolve(); await flush();
  assert.deepEqual(s.calls.at(-1).input, { name: 'My Notes' });
  assert.match(s.surface.textContent, /Vault opened: My Notes/); assert.match(s.surface.querySelector('.ln-vault-recents').textContent, /My Notes/);
  assert.equal(s.surface.querySelectorAll('form:not([hidden])').length, 0);
  await s.stop();
});

test('selection cancellation preserves the previous folder; failures preserve values and allow retry', async () => {
  const options = { openFailure: 'ACCESS_DENIED' }; const s = setup(options); await s.ready();
  find(s, 'Select vault').click(); let form = [...s.surface.querySelectorAll('form')].find(f => !f.hidden);
  form.querySelector('button[aria-label=Browse]').click(); await flush();
  s.selections.push(ok(null)); form.querySelector('button[aria-label=Browse]').click(); await flush();
  assert.equal(form.querySelector('input[readonly]').value, location.label);
  form.dispatchEvent(new s.dom.window.Event('submit', { cancelable: true })); await flush();
  assert.match(form.textContent, /Access to this folder was denied/); assert.equal(form.querySelector('[type=submit]').disabled, false);
  options.openFailure = null; form.dispatchEvent(new s.dom.window.Event('submit', { cancelable: true })); await flush();
  assert.match(s.surface.textContent, /Vault opened: Stored name/); assert.equal(s.calls.at(-1).input, undefined);
  await s.stop();
});

test('recent entries reopen without browsing and unavailable folders display recoverable errors', async () => {
  const options = { entries: [{ location, name: '<img src=x>' }], openFailure: 'NOT_FOUND' }; const s = setup(options); await s.ready();
  assert.equal(s.surface.querySelector('img'), null);
  s.surface.querySelector('.ln-vault-recents li button').click(); await flush();
  assert.equal(s.calls.some(c => c.operation === 'select'), false);
  assert.match(s.surface.textContent, /This folder is unavailable/);
  assert.equal(s.surface.querySelectorAll('.ln-vault-recents li').length, 1);
  await s.stop();
});

test('history errors are retryable; themes and locale updates retain typed form values', async () => {
  const options = { historyFailure: true }; const s = setup(options); await s.ready();
  assert.match(s.surface.textContent, /Could not load recent vaults/); options.historyFailure = false; find(s, 'Retry').click(); await flush();
  assert.equal(find(s, 'Retry').hidden, true);
  find(s, 'Create vault').click(); const name = s.surface.querySelector('form:not([hidden]) input:not([readonly])');
  name.value = 'Draft'; name.dispatchEvent(new s.dom.window.Event('input'));
  s.tools.themes.select('lunaris.base-theme-engine.light');
  assert.equal(s.surface.querySelector('.ln-vault').style.getPropertyValue('--vault-background'), '#F5F7FA');
  s.tools.localization.register('test.languages', { en: { label: 'Language' }, fr: { label: 'Langue' } }, s.context.signal); s.tools.localization.setLocale('fr'); await flush();
  assert.equal(name.value, 'Draft'); assert.ok(find(s, 'Create vault'));
  await s.stop();
});

test('shutdown during browsing never publishes a late selection or touches closed SDK handles', async () => {
  const pending = deferred(); const s = setup(); await s.ready(); s.selections.push(pending.promise);
  find(s, 'Select vault').click(); s.surface.querySelector('form:not([hidden]) button[aria-label=Browse]').click();
  await s.session.stop(); pending.resolve(ok(location)); await flush();
  assert.equal(s.surface.childElementCount, 0); assert.equal(s.calls.filter(c => c.operation === 'open').length, 0);
  s.dom.window.close();
});

test('denied Vault access fails through host recovery; missing selector role can register later', async () => {
  const denied = setup({ denied: true }); await denied.starting; assert.equal(denied.session.snapshot().phase, 'fallback'); await denied.stop();
  const s = setup({ noKit: true }); await s.ready(); assert.equal(s.surface.querySelector('section'), null);
  s.tools.components.register({ id: 'lunaris.vault-selector', mount(target) {
    const node = target.ownerDocument.createElement('section'); node.textContent = 'Replacement selector'; target.append(node);
    return { update() {}, dispose() { node.remove(); } };
  } }, s.context.signal); await flush();
  assert.match(s.surface.textContent, /Replacement selector/); await s.stop();
});
