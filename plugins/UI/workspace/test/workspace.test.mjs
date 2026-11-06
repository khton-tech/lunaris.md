import { useBrowser } from '../../../../tools/test/browser.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { definePlugin } from '@lunaris/sdk';
import { TestScheduler } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Components } from '@lunaris/components';
import { Themes } from '@lunaris/themes';
import { Localization } from '@lunaris/localization';
import { Vault, VaultLocations, VaultChanged, VaultHistory, VaultHistoryChanged } from '@lunaris/vault';
import { Workspace } from '@lunaris/workspace';
import workspaceProvider from "@lunaris/workspace-provider";
import workspacePlugin from '@lunaris/workspace-plugin';
import { createVaultSelector } from '@lunaris/vault-selector';
import { createStartupProvider } from '@lunaris/startup-provider';
import localization from '@lunaris/localization-manager';
import componentProvider from '@lunaris/component-provider';
import kit from '@lunaris/mantine-components';
import themes from '@lunaris/theme-provider';
import baseTheme from '@lunaris/base-theme-engine';
import { HostSession } from '@lunaris/tauri';
import { composeSlotSurface } from '../../../../hosts/tauri/dist/slots.js';

const ok = value => ({ ok: true, value });
const fail = code => ({ ok: false, error: { code, message: code } });
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
const manifest = (id, provides = [], requires = [], permissions = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js',
  provides: provides.map(t => ({ kind: t.kind, id: t.id, version: t.version })), requires: requires.map(t => ({ kind: t.kind, id: t.id, range: `^${t.version}` })), permissions, optionalPermissions: [] });

async function setup(options = {}) {
  const dom = useBrowser(new JSDOM('<div id="app"></div>')); const surface = dom.window.document.getElementById('app');
  const logs = []; let current = options.current ?? null; let serial = 0; let ctx; let tools; let service;
  const logger = definePlugin({ manifest: manifest('test.logger', [Logger]), activate(context) {
    context.provide(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, (...args) => { logs.push([level, ...args]); return true; }])));
  } });
  const vaults = definePlugin({ manifest: manifest('test.vaults', [Vault, VaultLocations, VaultChanged, VaultHistory, VaultHistoryChanged]), activate(context) {
    async function open(location, input) {
      const previous = current; current = { id: `vault-${++serial}`, name: input?.name ?? 'Notes' };
      await context.events.emit(VaultChanged, { kind: previous ? 'switched' : 'opened', previous, current, location });
      return ok(current);
    }
    service = { current: () => current, open: () => open({ reference: 'saved', label: 'Folder' }), async close() {
      options.closeCalls = (options.closeCalls ?? 0) + 1;
      await options.beforeClose?.();
      if (options.closeFailure) return fail(options.closeFailure);
      const previous = current; current = null;
      await context.events.emit(VaultChanged, { kind: 'closed', previous, current }); return ok(null);
    } };
    context.provide(Vault, service);
    context.provide(VaultLocations, { describe: async reference => ok({ reference, label: 'Folder' }), select: async () => ok({ reference: 'saved', label: 'Folder' }), open });
    context.provide(VaultHistory, { list: async () => ok([{ location: { reference: 'saved', label: 'Folder' }, name: 'Notes' }]), open: () => service.open() });
  } });
  const consumer = definePlugin({ manifest: manifest('test.consumer', [], [Workspace, Components, Themes, Localization], ['ui.dom']), activate(context) {
    ctx = context; tools = { workspace: context.use(Workspace), components: context.use(Components), themes: context.use(Themes), localization: context.use(Localization) };
    tools.themes.select('lunaris.base-theme-engine.monochrome');
    options.onActivate?.(tools, context);
    options.beforeLoaded?.(surface);
  } });
  const startup = createStartupProvider(); const layout = composeSlotSurface(surface); const selector = createVaultSelector({ art: 'ASCII', hideWhenVaultOpen: true });
  const session = new HostSession({ scheduler: new TestScheduler(), load: async () => ({ ...layout, startup,
    plugins: [logger, vaults, localization, componentProvider, kit, themes, baseTheme, consumer, startup.plugin, selector, workspacePlugin, workspaceProvider, ...layout.plugins],
    entrypoints: [startup.plugin.manifest.id, baseTheme.manifest.id, ...(options.noKit ? [] : [kit.manifest.id]), selector.manifest.id, workspacePlugin.manifest.id, consumer.manifest.id],
    grants: { ...layout.grants, [componentProvider.manifest.id]: ['ui.dom'], [kit.manifest.id]: ['ui.dom'], 'test.consumer': ['ui.dom'],
      [selector.manifest.id]: ['ui.dom', 'vault.access'], [workspacePlugin.manifest.id]: options.denied ? ['ui.dom'] : ['ui.dom', 'vault.access'] },
  }) });
  await session.start(); await flush();
  return { dom, surface, session, logs, ctx, tools, service, async open() { await service.open(); await flush(); },
    async stop() { await session.stop(); assert.equal(surface.childElementCount, 0);
      assert.deepEqual(session.snapshot().kernel.diagnostics.filter(item => item.code === 'CLEANUP_FAILED'), [], logs.filter(log => log[0] === 'error').map(log => log[3]?.error?.stack).join('\n')); dom.window.close(); } };
}
function panel(s, id = 'test.panel', options = {}) {
  const owner = s.ctx.scope.child(); const seen = []; const releases = [];
  const result = s.tools.components.register({ id, mount(target, props, signal) {
    if (options.fail) throw new Error('Panel render failure');
    const node = target.ownerDocument.createElement('article'); node.dataset.panel = id; target.append(node);
    const update = next => { if (options.updateFail) throw new Error('Panel update failure'); seen.push(next); node.textContent = `${next.label ?? 'Panel'}: ${next.workspace.vaultName}`; };
    update(props); signal.addEventListener('abort', () => releases.push(props.workspace.vaultId), { once: true });
    return { update, dispose() { node.remove(); } };
  } }, owner.signal);
  assert.equal(result.ok, true);
  return { owner, seen, releases };
}

test('selector hands off to an empty workspace and closing returns to the selector', async () => {
  const s = await setup(); assert.ok(s.surface.querySelector('.ln-vault')); assert.equal(s.surface.querySelector('.lm-workspace-empty'), null);
  s.surface.querySelector('.ln-vault-recents button').click(); await flush();
  assert.equal(s.surface.querySelector('.ln-vault'), null); assert.equal(s.surface.querySelector('[data-lunaris-slot="lunaris.vault-selector.screen"]'), null);
  assert.equal(s.surface.querySelector('h1').textContent, 'Notes');
  assert.equal(s.surface.querySelector('.lm-workspace-empty h2').textContent, 'No workspace plugins');
  assert.equal(s.surface.querySelectorAll('.lm-workspace-empty').length, 1);
  s.surface.querySelector('.lm-workspace-header button').click(); await flush();
  assert.equal(s.surface.querySelector('.lm-workspace-header'), null); assert.ok(s.surface.querySelector('.ln-vault'));
  assert.equal(s.surface.querySelector('[data-lunaris-slot="lunaris.workspace.screen"]'), null);
  await s.open(); assert.ok(s.surface.querySelector('.lm-workspace-empty')); await s.stop();
});

test('registrations before opening render after loaded and survive Vault switches with fresh owned instances', async () => {
  const s = await setup(); const p = panel(s);
  assert.equal(s.tools.workspace.register({ id: 'test.content', componentId: 'test.panel', props: { label: 'Files' } }, s.ctx.signal).ok, true);
  assert.equal(s.surface.querySelector('article'), null); await s.open();
  const old = s.surface.querySelector('article'); assert.equal(old.textContent, 'Files: Notes'); assert.equal(s.surface.querySelector('.lm-workspace-empty'), null);
  const firstVault = p.seen.at(-1).workspace.vaultId; assert.equal(Object.isFrozen(p.seen.at(-1).workspace), true);
  await s.open(); assert.equal(old.isConnected, false); assert.notEqual(s.surface.querySelector('article'), old);
  assert.notEqual(p.seen.at(-1).workspace.vaultId, firstVault); assert.deepEqual(p.releases, [firstVault]);
  assert.equal(s.tools.workspace.list().length, 1); await s.stop(); assert.equal(p.releases.length, 2);
});

test('placeholder follows consumer ownership, missing roles, late registration and role replacement', async () => {
  const s = await setup(); await s.open(); const owner = s.ctx.scope.child();
  s.tools.workspace.register({ id: 'test.content', componentId: 'test.panel' }, owner.signal);
  assert.ok(s.surface.querySelector('.lm-workspace-empty'));
  const first = panel(s); await flush(); assert.ok(s.surface.querySelector('article')); assert.equal(s.surface.querySelector('.lm-workspace-empty'), null);
  await first.owner.dispose(); await flush(); assert.equal(s.surface.querySelector('article'), null); assert.ok(s.surface.querySelector('.lm-workspace-empty'));
  const second = panel(s); await flush(); assert.ok(s.surface.querySelector('article'));
  await owner.dispose(); await flush(); assert.equal(s.surface.querySelector('article'), null); assert.equal(s.tools.workspace.list().length, 0);
  assert.ok(s.surface.querySelector('.lm-workspace-empty')); assert.equal(second.releases.length, 1);
  const replacement = s.ctx.scope.child();
  assert.equal(s.tools.workspace.register({ id: 'test.content', componentId: 'test.panel' }, replacement.signal).ok, true);
  await owner.dispose(); assert.ok(s.surface.querySelector('article')); await s.stop();
});

test('failed render and update restore the placeholder without leaving empty content slots', async () => {
  const s = await setup(); await s.open(); const options = { fail: true }; panel(s, 'test.panel', options);
  s.tools.workspace.register({ id: 'test.content', componentId: 'test.panel' }, s.ctx.signal);
  assert.ok(s.surface.querySelector('.lm-workspace-empty')); assert.equal(s.surface.querySelector('article'), null);
  options.fail = false; s.tools.workspace.update('test.content', { label: 'Recovered' }); assert.ok(s.surface.querySelector('article'));
  options.updateFail = true; s.tools.workspace.update('test.content', {}); assert.equal(s.surface.querySelector('article'), null);
  assert.ok(s.surface.querySelector('.lm-workspace-empty'));
  assert.equal(s.surface.querySelector('[data-lunaris-slot="lunaris.workspace.content"]').childElementCount, 1);
  assert.ok(s.logs.some(log => log[0] === 'error' && log[3]?.code === 'RENDER_FAILED')); await s.stop();
});

test('input validation, frozen copies, duplicate IDs and ordered content preserve the live registry', async () => {
  const s = await setup(); panel(s); await s.open(); const api = s.tools.workspace;
  for (const input of [null, {}, { id: 'test.bad', componentId: 'test.panel', props: { workspace: {} } }, { id: 'test.bad', componentId: 'test.panel', order: NaN },
    { id: 'test.bad', componentId: 'test.panel', get props() { throw new Error('Getter invoked'); } }]) assert.equal(api.register(input, s.ctx.signal).error.code, 'INVALID_ARGUMENT');
  const aborted = new AbortController(); aborted.abort(); assert.equal(api.register({ id: 'test.bad', componentId: 'test.panel' }, aborted.signal).ok, false);
  const props = { label: 'Last' }; api.register({ id: 'test.last', componentId: 'test.panel', props, order: 20 }, s.ctx.signal); props.label = 'Changed';
  api.register({ id: 'test.first', componentId: 'test.panel', props: { label: 'First' }, order: -20 }, s.ctx.signal);
  assert.deepEqual(api.list().map(item => item.id), ['test.first', 'test.last']);
  assert.equal(Object.isFrozen(api.list()), true); assert.equal(Object.isFrozen(api.list()[0].props), true);
  assert.deepEqual([...s.surface.querySelectorAll('article')].map(node => node.textContent), ['First: Notes', 'Last: Notes']);
  const root = s.surface.querySelector('[data-lunaris-slot="lunaris.workspace.screen"]'); assert.ok(root.firstElementChild.querySelector('header'));
  assert.equal(api.register({ id: 'test.first', componentId: 'test.panel' }, s.ctx.signal).error.code, 'ALREADY_REGISTERED');
  assert.equal(api.update('test.missing', {}).error.code, 'NOT_FOUND'); assert.equal(api.update('test.first', { workspace: {} }).error.code, 'INVALID_ARGUMENT');
  api.update('test.first', { label: 'Updated' }); assert.equal(s.surface.querySelector('article').textContent, 'Updated: Notes'); await s.stop();
});

test('existing Vault appears after startup; localized messages and theme changes preserve content', async () => {
  const s = await setup({ current: { id: 'existing', name: '<img src=x> Notes' }, beforeLoaded(surface) {
    assert.equal(surface.querySelector('.lm-workspace-header'), null); assert.equal(surface.querySelector('.lm-workspace-empty'), null);
  } });
  assert.equal(s.surface.querySelector('.ln-vault'), null); assert.ok(s.surface.querySelector('.lm-workspace-empty')); assert.equal(s.surface.querySelector('img'), null);
  assert.equal(s.surface.querySelector('h1').textContent, '<img src=x> Notes');
  s.tools.themes.register({ id: 'test.light', name: 'Light', properties: { appearance: 'light', colors: { background: '#ffffff', text: '#202020' } } }, s.ctx.signal);
  s.tools.themes.select('test.light'); assert.equal(s.surface.querySelector('.lm-workspace-empty').style.backgroundColor, 'rgb(255, 255, 255)');
  s.tools.localization.register('test.languages', { en: { title: 'Language' }, fr: { title: 'Langue' } }, s.ctx.signal); s.tools.localization.setLocale('fr'); await flush();
  assert.ok(s.surface.querySelector('.lm-workspace-empty')); assert.equal(s.surface.querySelector('button').textContent, 'Close vault');
  assert.equal(s.dom.window.localStorage.length, 0); await s.stop();
});

test('close is single-flight, failures retain the workspace and allow retry', async () => {
  const deferred = Promise.withResolvers(); const options = { beforeClose: () => deferred.promise, closeFailure: 'BUSY' };
  const s = await setup(options); await s.open(); const button = s.surface.querySelector('.lm-workspace-header button'); button.click(); button.click();
  assert.equal(options.closeCalls, 1); assert.equal(button.disabled, true); deferred.resolve(); await flush();
  assert.match(s.surface.querySelector('[role=alert]').textContent, /Could not close/); assert.equal(button.disabled, false);
  options.closeFailure = null; button.click(); await flush(); assert.ok(s.surface.querySelector('.ln-vault')); await s.stop();
});

test('shutdown during close ignores late results and releases owned screens', async () => {
  const deferred = Promise.withResolvers(); const s = await setup({ beforeClose: () => deferred.promise }); await s.open();
  s.surface.querySelector('.lm-workspace-header button').click(); await s.session.stop(); deferred.resolve(); await flush();
  assert.equal(s.surface.childElementCount, 0); s.dom.window.close();
});

test('missing placeholder role can arrive later; denied Vault permission enters host recovery', async () => {
  const s = await setup({ noKit: true }); await s.open(); assert.equal(s.surface.querySelector('section'), null);
  s.tools.components.register({ id: 'lunaris.workspace-empty', mount(target, props) {
    const node = target.ownerDocument.createElement('section'); node.className = 'replacement-empty'; node.textContent = props.title; target.append(node);
    return { update(next) { node.textContent = next.title; }, dispose() { node.remove(); } };
  } }, s.ctx.signal);
  await flush(); assert.equal(s.surface.querySelector('.replacement-empty').textContent, 'No workspace plugins'); await s.stop();
  const denied = await setup({ denied: true }); assert.equal(denied.session.snapshot().phase, 'fallback'); await denied.stop();
});
