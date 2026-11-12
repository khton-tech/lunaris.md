import { useBrowser, typeInput } from '../../../../tools/test/browser.mjs';
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
import { Vault, VaultCreation, VaultLocations, VaultChanged, VaultHistory, VaultHistoryChanged } from '@lunaris/vault';
import { createAccountAccess } from '@lunaris/account-access';
import { AccountSession, AccountSessionChanged, AccountVaults } from '@lunaris/remote';
import { FilesystemSources } from '@lunaris/filesystem';
import { createVaultSelector } from '@lunaris/vault-selector';
import { createRunner } from '@lunaris/runner';
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
const deferred = () => Promise.withResolvers();
const manifest = (id, tokens = [], required = [], permissions = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js',
  provides: tokens.map(t => ({ kind: t.kind, id: t.id, version: t.version })), requires: required.map(t => ({ kind: t.kind, id: t.id, range: `^${t.version}` })), permissions, optionalPermissions: [] });
const location = { reference: 'saved-folder', label: 'Selected folder' };

function setup(options = {}) {
  const dom = useBrowser(new JSDOM('<div id="app"></div>')); const surface = dom.window.document.getElementById('app');
  const finish = deferred(); const entered = deferred(); const logs = []; const selections = []; const calls = [];
  let current = null; let entries = options.entries ?? []; let tools; let context;
  const logger = definePlugin({ manifest: manifest('test.logger', [Logger]), activate(ctx) {
    ctx.provide(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, (...args) => { logs.push([level, ...args]); return true; }])));
  } });
  const config = definePlugin({ manifest: manifest('test.config', [Config]), activate(ctx) { ctx.provide(Config, { async read() { return ok({}); }, async get() { return ok(undefined); }, async set() { return ok(null); }, async remove() { return ok(false); } }); } });
  const services = definePlugin({ manifest: manifest('test.vaults', [Vault, VaultCreation, VaultLocations, VaultChanged, VaultHistory, VaultHistoryChanged]), activate(ctx) {
    async function open(folder, input) {
      calls.push({ operation: 'open', folder, input }); await options.beforeOpen?.();
      if (options.openFailure) return fail(options.openFailure);
      const previous = current; current = { id: `vault-${calls.length}`, name: input?.name ?? 'Stored name' };
      await ctx.events.emit(VaultChanged, { kind: previous ? 'switched' : 'opened', previous, current, location: folder });
      entries = [{ location: folder, name: current.name }, ...entries.filter(e => e.location.reference !== folder.reference)];
      await ctx.events.emit(VaultHistoryChanged, { entries });
      return ok(current);
    }
    ctx.provide(Vault, { current: () => current, open: () => open(location), async close() { const previous = current; current = null; await ctx.events.emit(VaultChanged, { kind: 'closed', previous, current }); return ok(null); } });
    ctx.provide(VaultCreation, { create: (parent, name) => open({ reference: parent.reference + '/' + name, label: parent.label + '/' + name }, { name }) });
    ctx.provide(VaultLocations, { async describe(reference) { return ok({ reference, label: reference }); }, async select() { calls.push({ operation: 'select' }); return selections.length ? await selections.shift() : ok(location); }, open });
    ctx.provide(VaultHistory, { async list() { return options.historyFailure ? fail('HISTORY_UNAVAILABLE') : ok(entries); }, async open(reference) {
      calls.push({ operation: 'recent', reference }); const entry = entries.find(e => e.location.reference === reference);
      return entry ? open(entry.location) : fail('NOT_FOUND');
    } });
  } });
  const toolPlugin = definePlugin({ manifest: manifest('test.tools', [], [Components, Themes, Localization, Vault], ['ui.dom', 'vault.access']), activate(ctx) {
    context = ctx; tools = { vaults: ctx.use(Vault), components: ctx.use(Components), themes: ctx.use(Themes), localization: ctx.use(Localization) };
    tools.themes.select('lunaris.base-theme-engine.monochrome');
  } });
  const slow = definePlugin({ manifest: manifest('test.slow'), async activate() { entered.resolve(); await finish.promise; } });
  const startup = createStartupProvider(); const runner = createRunner({ art: 'ASCII LOGO', hideWhenLoaded: true }); const selector = createVaultSelector({ art: 'ASCII LOGO', hideWhenVaultOpen: options.hideWhenVaultOpen, restoreLastVault: options.restoreLastVault });
  const account = createAccountAccess({ allowLocal: true });
  let accountState = null;
  const remote = definePlugin({ manifest: manifest('test.remote', [AccountSession, AccountSessionChanged, AccountVaults, FilesystemSources]), activate(ctx) {
    ctx.provide(AccountSession, {
      current: () => accountState,
      async connect(address) { calls.push({ operation: 'connect', address }); await options.connectGate; return ok({ protocol: 1, buildId: 'test', registration: 'invitation', name: 'Test server' }); },
      async register(login) { calls.push({ operation: 'register', login }); return ok({ id: 'a', login }); },
      async login(login) { accountState = { server: 'https://notes.example', account: { id: 'a', login }, epoch: '1' }; await ctx.events.emit(AccountSessionChanged, { current: accountState }); return ok(accountState.account); },
      async logout() { accountState = null; await ctx.events.emit(AccountSessionChanged, { current: null }); return ok(null); },
    });
    ctx.provide(AccountVaults, { async list() { return ok([{ id: 'remote', name: 'Remote notes', location, state: 'active', deletedAt: null, expiresAt: null }]); }, async create(name) { return ok({ id: 'created', name, location, state: 'active', deletedAt: null, expiresAt: null }); }, async trash() { return ok(null); }, async restore() { return fail('NOT_FOUND'); } });
    ctx.provide(FilesystemSources, { list: () => ['remote'], location: (_source, value) => ok(value), capabilitiesFor: () => fail('UNSUPPORTED'), remoteIdentity: () => fail('UNSUPPORTED'), locationVisible: () => true });
  } });
  const layout = composeSlotSurface(surface);
  const session = new HostSession({ scheduler: new TestScheduler(), load: async () => ({ ...layout, startup,
    plugins: [...(options.server ? [account, remote] : []), logger, config, services, localization, componentProvider, kit, themes, baseTheme, toolPlugin, startup.plugin, runner, selector, slow, ...layout.plugins],
    entrypoints: [startup.plugin.manifest.id, baseTheme.manifest.id, ...(options.noKit ? [] : [kit.manifest.id]), 'test.tools', runner.manifest.id, selector.manifest.id, 'test.slow'],
    grants: { ...layout.grants, ...(options.server ? { [account.manifest.id]: account.manifest.permissions } : {}), [componentProvider.manifest.id]: ['ui.dom'], [kit.manifest.id]: ['ui.dom'], 'test.tools': ['ui.dom', 'vault.access'],
      [runner.manifest.id]: ['ui.dom', 'config.access'], [selector.manifest.id]: options.denied ? ['ui.dom'] : ['ui.dom', 'vault.access', ...(options.server ? ['account.access'] : [])] },
  }) });
  const starting = session.start();
  return { dom, surface, finish, entered, starting, session, logs, calls, selections, get tools() { return tools; }, get context() { return context; },
    async ready() { await entered.promise; finish.resolve(); await starting; await flush(); },
    async stop() { await session.stop(); assert.equal(surface.childElementCount, 0); dom.window.close(); },
  };
}
const find = (s, label) => [...s.surface.querySelectorAll('button')].find(button => button.querySelector('.mantine-Button-label')?.textContent.trim() === label || button.getAttribute('aria-label') === label);

test('host hands off runner to the two-panel selector only after loaded, without opening dialogs', async () => {
  const s = setup(); await s.entered.promise;
  assert.equal(s.surface.querySelector('.ln-vault'), null); assert.equal(s.surface.querySelector('[role=status]').textContent, 'Starting plugins');
  s.finish.resolve(); await s.starting; await flush();
  assert.equal(s.surface.querySelectorAll('section').length, 1); assert.ok(s.surface.querySelector('.ln-vault'));
  assert.equal(s.surface.querySelector('pre').textContent, 'ASCII LOGO'); assert.equal(s.surface.querySelector('[data-slot-id="lunaris.runner.screen"]'), null);
  assert.ok(s.surface.querySelector('.ln-vault-recents').nextElementSibling.classList.contains('ln-vault-main'));
  const palette = s.surface.querySelector('.ln-vault').style;
  assert.equal(palette.getPropertyValue('--vault-background'), '#0F0F0F');
  assert.equal(palette.getPropertyValue('--vault-panel'), '#1A1A1A');
  assert.equal(palette.getPropertyValue('--vault-caret'), '#F5F5F5');
  assert.equal(palette.getPropertyValue('--vault-error'), '#AC8C8C');
  assert.equal(palette.getPropertyValue('--vault-accent'), '#E7E7E7');
  assert.equal(find(s, 'Create vault').getAttribute('aria-expanded'), 'false'); assert.ok(find(s, 'Select vault'));
  assert.match(s.surface.textContent, /No recent vaults/); assert.deepEqual(s.calls, []);
  assert.equal(s.logs.some(log => log[3]?.code === 'PARAMETER_MISSING'), false);
  await s.stop();
});

test('create card browses without opening, requires a name and submits once through SDK before displaying success/history', async () => {
  const pending = deferred(); const s = setup({ beforeOpen: () => pending.promise }); await s.ready();
  find(s, 'Create vault').click();
  let form = [...s.surface.querySelectorAll('form')].find(form => !form.hasAttribute('inert'));
  assert.equal(find(s, 'Create vault').getAttribute('aria-expanded'), 'true');
  assert.equal(form.querySelector('[type=submit]').disabled, true);
  assert.equal(form.querySelector('button[aria-label=Browse]'), s.dom.window.document.activeElement);
  form.querySelector('button[aria-label=Browse]').click(); await flush();
  assert.deepEqual(s.calls.map(c => c.operation), ['select']); assert.equal(form.querySelector('.ln-vault-path').textContent, location.label);
  const name = form.querySelector('input:not([readonly])'); typeInput(name, 'My Notes');
  assert.equal(form.querySelector('[type=submit]').disabled, false);
  form.dispatchEvent(new s.dom.window.Event('submit', { bubbles: true, cancelable: true }));
  form.dispatchEvent(new s.dom.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(s.calls.filter(c => c.operation === 'open').length, 1); assert.equal(name.disabled, true);
  pending.resolve(); await flush();
  assert.deepEqual(s.calls.at(-1).input, { name: 'My Notes' });
  assert.equal(s.calls.at(-1).folder.reference, location.reference + '/My Notes');
  assert.equal(s.surface.querySelector('.ln-vault-status').textContent, 'My Notes'); assert.match(s.surface.querySelector('.ln-vault-recents').textContent, /My Notes/);
  assert.equal(s.surface.querySelector('li button[aria-current=true]').textContent.includes('My Notes'), true);
  assert.equal(s.surface.querySelectorAll('form:not([inert])').length, 0);
  await s.stop();
});

test('selection cancellation preserves the previous folder; failures preserve values and allow retry', async () => {
  const options = { openFailure: 'ACCESS_DENIED' }; const s = setup(options); await s.ready();
  find(s, 'Select vault').click(); let form = [...s.surface.querySelectorAll('form')].find(f => !f.hasAttribute('inert'));
  form.querySelector('button[aria-label=Browse]').click(); await flush();
  s.selections.push(ok(null)); form.querySelector('button[aria-label=Browse]').click(); await flush();
  assert.equal(form.querySelector('.ln-vault-path').textContent, location.label);
  form.dispatchEvent(new s.dom.window.Event('submit', { bubbles: true, cancelable: true })); await flush();
  assert.match(form.textContent, /Access to this folder was denied/); assert.equal(form.querySelector('[type=submit]').disabled, false);
  options.openFailure = null; form.dispatchEvent(new s.dom.window.Event('submit', { bubbles: true, cancelable: true })); await flush();
  assert.equal(s.surface.querySelector('.ln-vault-status').textContent, 'Stored name'); assert.equal(s.calls.at(-1).input, undefined);
  await s.stop();
});

test('recent entries reopen without browsing and unavailable folders display recoverable errors', async () => {
  const options = { entries: [{ location, name: '<img src=x>' }], openFailure: 'NOT_FOUND' }; const s = setup(options); await s.ready();
  assert.equal(s.surface.querySelector('img'), null);
  s.surface.querySelector('.ln-vault-recents li button').click(); await flush();
  assert.equal(s.calls.some(c => c.operation === 'select'), false);
  assert.match(s.surface.textContent, /This folder is unavailable/);
  assert.equal(s.surface.querySelectorAll('.ln-vault-recents li').length, 1);
  assert.equal(s.surface.querySelector('li [aria-current]'), null);
  options.openFailure = null; s.surface.querySelector('.ln-vault-recents li button').click(); await flush();
  assert.ok(s.surface.querySelector('li button[aria-current=true]'));
  await s.stop();
});

test('pointer expansion leaves focus alone; closed forms immediately become inert while preserving drafts', async () => {
  const s = setup(); await s.ready();
  find(s, 'Create vault').dispatchEvent(new s.dom.window.MouseEvent('click', { bubbles: true, detail: 1 }));
  let form = s.surface.querySelector('form:not([inert])'); const browse = form.querySelector('[aria-label=Browse]');
  assert.notEqual(s.dom.window.document.activeElement, browse);
  assert.equal(form.querySelector('input[readonly]'), null);
  const name = form.querySelector('input'); typeInput(name, 'Draft'); name.focus();
  find(s, 'Create vault').click();
  assert.equal(form.hasAttribute('inert'), true); assert.equal(form.closest('.ln-vault-disclosure').getAttribute('aria-hidden'), 'true');
  assert.equal(name.disabled, true); assert.equal(s.dom.window.document.activeElement, find(s, 'Create vault'));
  find(s, 'Select vault').click(); assert.equal(browse.disabled, true);
  find(s, 'Create vault').click(); form = s.surface.querySelector('form:not([inert])');
  assert.equal(form.querySelector('input').value, 'Draft'); assert.equal(s.dom.window.document.activeElement, browse);
  await s.stop();
});

test('history errors are retryable; themes and locale updates retain typed form values', async () => {
  const options = { historyFailure: true }; const s = setup(options); await s.ready();
  assert.match(s.surface.textContent, /Could not load recent vaults/); options.historyFailure = false; find(s, 'Retry').click(); await flush();
  assert.equal(find(s, 'Retry').hidden, true);
  find(s, 'Create vault').click(); const name = s.surface.querySelector('form:not([inert]) input:not([readonly])');
  typeInput(name, 'Draft');
  assert.equal(s.tools.themes.register({ id: 'test.alternate', name: 'Alternate', properties: { colors: { background: '#FFFFFF' } } }, s.context.signal).ok, true);
  s.tools.themes.select('test.alternate');
  assert.equal(s.surface.querySelector('.ln-vault').style.getPropertyValue('--vault-background'), '#FFFFFF');
  assert.equal(s.surface.querySelector('.ln-vault').style.getPropertyValue('--vault-caret'), 'currentColor');
  assert.equal(s.surface.querySelector('.ln-vault').style.getPropertyValue('--vault-error'), 'currentColor');
  s.tools.localization.register('test.languages', { en: { label: 'Language' }, fr: { label: 'Langue' } }, s.context.signal); s.tools.localization.setLocale('fr'); await flush();
  assert.equal(name.value, 'Draft'); assert.ok(find(s, 'Create vault'));
  await s.stop();
});

test('shutdown during browsing never publishes a late selection or touches closed SDK handles', async () => {
  const pending = deferred(); const s = setup(); await s.ready(); s.selections.push(pending.promise);
  find(s, 'Select vault').click(); s.surface.querySelector('form:not([inert]) button[aria-label=Browse]').click();
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


test('create validates directory names and preserves parent/name on collision', async () => {
  const s = setup({ openFailure: 'ALREADY_EXISTS' }); await s.ready(); find(s, 'Create vault').click();
  const form = [...s.surface.querySelectorAll('form')].find(form => !form.hasAttribute('inert'));
  assert.ok(form.textContent.includes('Parent folder'));
  form.querySelector('[aria-label=Browse]').click(); await flush();
  const input = form.querySelector('input');
  for (const name of ['../escape', 'a/b', 'CON', 'name.']) { typeInput(input, name); assert.equal(form.querySelector('[type=submit]').disabled, true); }
  typeInput(input, 'Notes'); form.dispatchEvent(new s.dom.window.Event('submit', { bubbles: true, cancelable: true })); await flush();
  assert.match(s.surface.textContent, /folder with this name already exists/); assert.equal(input.value, 'Notes');
  assert.equal(form.querySelector('.ln-vault-path').textContent, location.label); assert.equal(form.querySelector('[type=submit]').disabled, false);
  await s.stop();
});


test('startup restores only the latest Vault without a folder dialog', async () => {
  const s = setup({ hideWhenVaultOpen: true, entries: [
    { location, name: 'Latest' }, { location: { reference: 'older', label: 'Older' }, name: 'Older' },
  ] });
  await s.ready();
  assert.deepEqual(s.calls.map(c => c.operation), ['recent', 'open']);
  assert.equal(s.calls[0].reference, location.reference);
  assert.equal(s.surface.querySelector('.ln-vault'), null);
  await s.stop();
});

test('failed startup restoration shows selection without trying older Vaults', async () => {
  const s = setup({ hideWhenVaultOpen: true, openFailure: 'NOT_FOUND', entries: [
    { location, name: 'Missing' }, { location: { reference: 'older', label: 'Older' }, name: 'Older' },
  ] });
  await s.ready();
  assert.deepEqual(s.calls.map(c => c.operation), ['recent', 'open']);
  assert.ok(s.surface.querySelector('.ln-vault'));
  assert.match(s.surface.textContent, /This folder is unavailable/);
  await s.stop();
});

test('closing a Vault restores the start screen without reopening the latest Vault or a native picker', async () => {
  const s = setup({ hideWhenVaultOpen: true, entries: [{ location, name: 'Latest' }] }); await s.ready();
  assert.equal(s.surface.querySelector('.ln-vault'), null);
  const before = s.calls.length; assert.equal((await s.tools.vaults.close()).ok, true); await flush();
  assert.ok(s.surface.querySelector('.ln-vault')); assert.ok(find(s, 'Create vault')); assert.ok(find(s, 'Select vault'));
  assert.equal(s.calls.length, before); assert.equal(s.tools.vaults.current(), null);
  await s.stop();
});


test('server disclosure stays inside the local selector through address, registration and remote Vault opening', async () => {
  const s = setup({ server: true, hideWhenVaultOpen: true }); await s.ready();
  const selector = s.surface.querySelector('.ln-vault');
  const toggle = find(s, 'Sign in to server'); assert.ok(toggle); assert.ok(toggle.classList.contains('ln-vault-toggle'));
  toggle.click(); await flush();
  const form = () => s.surface.querySelector('.lm-account-access');
  assert.ok(selector.contains(form()));
  assert.equal(form().closest('.lm-root').dataset.presentation, 'embedded');
  assert.equal(s.surface.querySelector('[data-slot-id="lunaris.account-access.screen"]'), null);
  typeInput(form().querySelector('input[type=url]'), 'https://notes.example');
  form().querySelector('form').dispatchEvent(new s.dom.window.Event('submit', { bubbles: true, cancelable: true })); await flush();
  assert.equal(s.surface.querySelector('.ln-vault'), selector);
  find(s, 'Create account').click(); await flush();
  typeInput(form().querySelector('[autocomplete=username]'), 'alice');
  typeInput(form().querySelector('[autocomplete=new-password]'), 'correct password');
  typeInput(form().querySelector('[autocomplete=off]'), 'invitation');
  form().querySelector('form').dispatchEvent(new s.dom.window.Event('submit', { bubbles: true, cancelable: true })); await flush();
  assert.ok(selector.contains(form())); assert.ok(find(s, 'Remote notes'));
  toggle.click(); await flush(); assert.equal(toggle.getAttribute('aria-expanded'), 'false'); assert.equal(form(), null);
  toggle.click(); await flush(); assert.ok(find(s, 'Remote notes'));
  find(s, 'Create vault').click(); await flush();
  assert.equal(toggle.getAttribute('aria-expanded'), 'false'); assert.equal(form(), null);
  toggle.click(); await flush(); find(s, 'Remote notes').click(); await flush();
  assert.equal(s.surface.querySelector('.ln-vault'), null); assert.equal(form(), null);
  assert.ok(s.calls.some(call => call.operation === 'open'));
  await s.tools.vaults.close(); await flush(); assert.ok(s.surface.querySelector('.ln-vault'));
  assert.equal(s.surface.querySelector('.lm-account-access'), null);
  await s.stop();
});

test('server disclosure blocks competing actions and ignores late connection results after its owner closes', async () => {
  const gate = deferred(); const s = setup({ server: true, connectGate: gate.promise }); await s.ready();
  find(s, 'Sign in to server').click(); await flush();
  const form = s.surface.querySelector('.lm-account-access form');
  typeInput(form.querySelector('input'), 'https://notes.example');
  form.dispatchEvent(new s.dom.window.Event('submit', { bubbles: true, cancelable: true })); await flush();
  assert.equal(find(s, 'Create vault').disabled, true); assert.equal(find(s, 'Sign in to server').disabled, true);
  assert.ok(form.querySelector('.mantine-Loader-root'));
  assert.equal(form.querySelector('input').readOnly, true);
  assert.equal(form.querySelector('input').disabled, false);
  assert.equal(form.querySelector('button[type=submit]').textContent, 'Connecting…');
  form.dispatchEvent(new s.dom.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(s.calls.filter(call => call.operation === 'connect').length, 1);
  const stopping = s.session.stop(); gate.resolve(); await stopping; await flush();
  assert.equal(s.surface.querySelector('.lm-account-access'), null);
  assert.equal(s.session.snapshot().kernel.diagnostics.some(d => d.code === 'CLEANUP_FAILED'), false);
  s.dom.window.close();
});


test('embedded sign-in supports server navigation, Escape focus and theme replacement', async () => {
  const s = setup({ server: true }); await s.ready();
  find(s, 'Sign in to server').click(); await flush();
  let input = s.surface.querySelector('.lm-account-access input'); typeInput(input, 'https://notes.example'); input.focus();
  input.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flush();
  assert.equal(s.dom.window.document.activeElement, find(s, 'Sign in to server'));
  assert.equal(s.surface.querySelector('.lm-account-access'), null);
  find(s, 'Sign in to server').click(); await flush();
  assert.equal(s.surface.querySelector('.lm-account-access input').value, 'https://notes.example');
  assert.ok(s.surface.querySelector('.ln-vault .lm-account-access'));
  const submit = () => s.surface.querySelector('.lm-account-access form').dispatchEvent(new s.dom.window.Event('submit', { bubbles: true, cancelable: true }));
  submit(); await flush(); find(s, 'Change server').click(); await flush();
  assert.ok(s.surface.querySelector('.lm-account-access input[type=url]'));
  submit(); await flush();
  typeInput(s.surface.querySelector('[autocomplete=username]'), 'alice');
  typeInput(s.surface.querySelector('[autocomplete=current-password]'), 'correct password');
  s.tools.themes.select('lunaris.base-theme-engine.windows-xp'); await flush();
  assert.equal(s.surface.querySelector('[autocomplete=current-password]').value, 'correct password');
  assert.equal(s.surface.querySelector('.lm-account-access').closest('.lm-root').style.backgroundColor, 'transparent');
  submit(); await flush(); assert.ok(find(s, 'Remote notes'));
  assert.equal(s.calls.some(call => call.operation === 'register'), false);
  await s.stop();
});
