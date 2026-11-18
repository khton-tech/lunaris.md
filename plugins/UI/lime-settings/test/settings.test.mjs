import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { definePlugin } from '@lunaris/sdk';
import { Lime, LimeChanged } from '@lunaris/lime';
import ui from '@lunaris/lime-settings';
import { typeInput } from '../../../../tools/test/browser.mjs';
import { setupWorkspace, openSettings, flush } from '../../../../tools/test/workspace.mjs';

const ok = value => ({ ok: true, value });
const manifest = { manifestVersion: 1, id: 'test.package', version: '1.0.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './plugin.js', metadata: { name: '<img src=x> Novel view', author: 'Author', description: 'Long metadata '.repeat(30), languages: ['en', 'ru'], translations: { ru: { name: 'Новый инструмент' } }, platforms: ['desktop'], repository: 'https://example.com/plugin', fields: [{ label: 'License', value: 'MIT' }] }, provides: [], requires: [{ kind: 'api', id: 'test.dependency', range: '^1.0.0' }], permissions: [], optionalPermissions: [] };
async function fixture({ composition = false } = {}) {
  let state = { vaultId: 'vault-1', busy: false, safeMode: false, error: null, installations: [] }; let provider; const calls = []; let selectedProvider = 'test.first'; let revision = 7;
  let pickedManifest = manifest;
  let removalFailure = false;
  let profile = { bindings: [], disabledBuiltins: [] };
  const builtins = [
    { id: 'test.consumer', state: 'active', version: '1.0.0', mutable: true },
    { id: 'test.first', state: 'active', version: '1.0.0', mutable: true },
    { id: 'test.core', state: 'active', version: '1.0.0', mutable: false },
  ];
  const publish = async () => { await provider.events.emit(LimeChanged, state); };
  const plugin = definePlugin({ manifest: { ...manifest, id: 'test.engine', provides: [Lime, LimeChanged].map(token => ({ kind: token.kind, id: token.id, version: token.version })), requires: [] }, activate(ctx) {
    provider = ctx; ctx.provide(Lime, {
      snapshot: () => state,
      plan(id) { return ok({ pluginId: id, revision, affected: [id, 'test.consumer'], dependencies: [
        { kind: 'api', id: 'test.dependency', range: '^1.0.0', optional: false, selected: selectedProvider, candidates: [{ id: 'test.first', version: '1.0.0', state: 'active' }, { id: 'test.second', version: '1.0.0', state: 'disabled' }, { id: 'test.third', version: '1.1.0', state: 'active' }] },
        { kind: 'event', id: 'test.missing', range: '^1.0.0', optional: true, candidates: [] },
        { kind: 'api', id: 'test.fixed', range: '^1.0.0', optional: false, selected: 'test.only', candidates: [{ id: 'test.only', version: '1.0.0', state: 'active' }] },
      ] }); },
      async selectProvider(...args) { calls.push(['selectProvider', ...args]); selectedProvider = args[3]; revision++; return ok(null); },
      composition() { return composition ? ok({ revision, profile, savedProfile: profile, builtins }) : { ok: false, error: { code: 'UNSUPPORTED' } }; },
      async applyComposition(profileChange, expectedRevision) {
        calls.push(['applyComposition', profileChange, expectedRevision]); profile = profileChange; revision++; await publish(); return ok(null);
      },
      async preview() {
        calls.push(['preview']);
        return ok({ ticket: 1, manifest: pickedManifest, digest: 'a'.repeat(64), platformWarning: true,
          dependencyPlan: { pluginId: pickedManifest.id, revision, affected: [pickedManifest.id], dependencies: [], graph: [
            { pluginId: 'test.transitive', dependencies: [{ kind: 'api', id: 'test.missing', range: '^2.0.0', optional: false, candidates: [] }] },
          ] },
        });
      },
      cancelPreview(ticket) { calls.push(['cancel', ticket]); },
      async install(ticket, enabled = true) { calls.push(['install', ticket, enabled]); state = { ...state, installations: [{ id: manifest.id, version: manifest.version, digest: 'a'.repeat(64), manifest, enabled, recoveryRequired: false, removalPending: false, state: enabled ? 'active' : 'disabled' }] }; await publish(); return ok(null); },
      async update(ticket) { calls.push(['update', ticket]); return ok(null); },
      async enable(id) { calls.push(['enable', id]); return ok(null); },
      async disable(id) { calls.push(['disable', id]); state = { ...state, installations: state.installations.map(item => ({ ...item, enabled: false, state: 'disabled' })) }; await publish(); return ok(null); },
      async retry(id) { calls.push(['retry', id]); return ok(null); },
      async remove(id, deleteData) {
        calls.push(['remove', id, deleteData]);
        if (removalFailure) {
          removalFailure = false;
          state = { ...state, installations: state.installations.map(item => ({ ...item, removalPending: true, state: 'removing' })) };
          await publish();
          return { ok: false, error: { code: 'STORAGE_FAILED' } };
        }
        state = { ...state, installations: [] }; await publish(); return ok(null);
      },
      async restore(safeMode) { calls.push(['restore', safeMode]); state = { ...state, safeMode }; await publish(); return ok(null); },
    });
  } });
  const s = await setupWorkspace({ settings: true, plugins: [plugin, ui], entrypoints: [ui.manifest.id], grants: { [ui.manifest.id]: ui.manifest.permissions } });
  await s.open(); await openSettings(s);
  [...s.surface.querySelectorAll('.lm-settings-category')].find(element => element.textContent === 'Plugins').click(); await flush();
  const { document, KeyboardEvent } = s.dom.window;
  const view = () => s.surface.querySelector('.lm-lime-settings');
  const button = text => [...document.querySelectorAll('.lm-lime-settings button, .lm-lime-overlay button')].find(element => element.textContent === text);
  const row = (id = manifest.id) => view().querySelector(`[data-lime-id="${id}"]`);
  const rowActions = () => row().querySelector('button[aria-haspopup="menu"]');
  const search = () => view().querySelector('input[aria-label="Search plugins"]');
  const press = (target, key) => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  async function openMenu(trigger) {
    trigger.focus(); trigger.click(); await flush();
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    let menu = document.getElementById(trigger.getAttribute('aria-controls'));
    for (let attempt = 0; !menu && attempt < 25; attempt++) {
      await delay(10);
      menu = document.getElementById(trigger.getAttribute('aria-controls'));
    }
    assert.equal(menu?.getAttribute('role'), 'menu');
    assert.ok(menu.closest('.lm-dropdown-overlay')?.closest('.lm-settings-dialog') === s.surface.querySelector('.lm-settings-dialog'));
    return menu;
  }
  async function chooseMenuItem(trigger, label) {
    const menu = await openMenu(trigger);
    const item = [...menu.querySelectorAll('[role=menuitem]')].find(element => element.textContent === label);
    assert.ok(item, `Menu item ${label} is available`);
    item.click(); await flush();
  }
  return { ...s, calls, view, button, row, rowActions, search, press, openMenu, chooseMenuItem,
    pickPackage(packageManifest) { pickedManifest = packageManifest; },
    failNextRemoval() { removalFailure = true; },
    async setVault(vaultId) { state = { ...state, vaultId }; await publish(); await flush(); },
    async setError(error) { state = { ...state, error }; await publish(); await flush(); },
  };
}

test('Lime composes inside real Settings/Workspace and confirms preview before installation', async () => {
  const s = await fixture();
  try {
    assert.equal(s.surface.querySelector('.lm-settings-page h1').textContent, 'Plugins');
    assert.equal(s.surface.querySelector('.lm-settings-page h2').textContent, 'Vault plugins');
    assert.deepEqual([...s.view().querySelectorAll('.lm-lime-overview button')].map(button => button.textContent), ['Open without third-party plugins', 'Add plugin']);
    assert.equal(s.view().querySelector('.lm-lime-installed-count').textContent, '0');
    assert.equal(s.view().querySelector('h3').textContent, 'Manage plugins');
    assert.equal(s.search(), null);
    assert.equal(s.button('Add plugin').dataset.variant, 'outline');
    assert.ok(s.button('Add plugin').hasAttribute('data-accent'));
    await s.setVault(null);
    assert.match(s.view().textContent, /Open a Vault/);
    assert.equal(s.view().querySelector('button'), null);
    await s.setVault('vault-1');
    const view = s.view(); const root = view.closest('.lm-root');
    assert.equal(root.dataset.presentation, 'embedded'); assert.equal(root.dataset.sizing, 'content'); assert.equal(root.style.backgroundColor, 'transparent');
    assert.match(view.textContent, /No third-party plugins installed/);
    s.button('Add plugin').click(); await flush();
    assert.deepEqual(s.calls, [['preview']]);
    const overlay = s.dom.window.document.querySelector('.lm-lime-overlay');
    const dialog = overlay?.querySelector('[role=dialog]');
    assert.ok(dialog);
    assert.equal(overlay.closest('.lm-settings-dialog'), s.surface.querySelector('.lm-settings-dialog'));
    assert.equal(view.querySelector('[role=dialog]'), null);
    assert.equal(overlay.dataset.mantineColorScheme, root.dataset.mantineColorScheme);
    const [overview, dependencies] = dialog.querySelectorAll('[role=tab]');
    assert.equal(overview.getAttribute('aria-selected'), 'true');
    assert.doesNotMatch(dialog.textContent, /test.transitive/);
    assert.equal(dialog.querySelector('img'), null);
    dependencies.click(); await flush();
    assert.equal(dependencies.getAttribute('aria-selected'), 'true');
    assert.match(dialog.textContent, /test.transitive \/ api:test.missing/);
    assert.match(dialog.textContent, /No compatible provider installed/);
    assert.match(dialog.textContent, /author has not declared support/);
    await s.setError('RUNTIME_FAILED');
    assert.match(dialog.textContent, /environment needs recovery/);
    assert.equal(view.querySelector('[role=alert]'), null);
    await s.setError(null);
    assert.equal(s.button('Install plugin').closest('.lm-lime-panel'), null);
    s.button('Install plugin').click(); await flush(); assert.ok(s.calls.some(call => call[0] === 'install'));
    assert.equal(view.querySelector('.lm-lime-installed-count').textContent, '1');
    assert.equal(s.dom.window.document.querySelector('.lm-lime-overlay'), null);
    assert.equal(s.dom.window.document.activeElement.textContent, 'Add plugin');
    const actions = s.rowActions();
    assert.equal(actions.getAttribute('aria-label'), `Actions: ${manifest.metadata.name}`);
    assert.equal(s.row().querySelector('img'), null);
    assert.equal(s.button('Remove'), undefined);
    const toggle = s.row().querySelector('input[type=checkbox]'); toggle.click(); await flush(); assert.deepEqual(s.calls.at(-1), ['disable', 'test.package']);

    s.pickPackage({ ...manifest, version: '1.1.0' });
    await s.chooseMenuItem(actions, 'Update');
    assert.equal(s.calls.at(-1)[0], 'preview');
    const updateDialog = s.dom.window.document.querySelector('.lm-lime-overlay [role=dialog]');
    assert.match(updateDialog.textContent, /1\.1\.0/);
    s.press(updateDialog.querySelector('[role=tab]'), 'Escape'); await flush();
    assert.deepEqual(s.calls.at(-1), ['cancel', 1]);
    assert.ok(s.dom.window.document.activeElement === actions, 'Update preview returns focus to row actions');
    await s.chooseMenuItem(actions, 'Update');
    s.button('Update').click(); await flush();
    assert.deepEqual(s.calls.at(-1), ['update', 1]);

    await s.chooseMenuItem(actions, 'Remove');
    assert.match(view.textContent, /retain its data and settings/);
    assert.match(view.textContent, /Affected plugins: test.package, test.consumer/);
    s.button('Cancel').click(); await flush();
    assert.ok(s.dom.window.document.activeElement === actions, 'Cancelling removal returns focus to row actions');
    assert.equal(s.calls.some(call => call[0] === 'remove'), false);
    await s.chooseMenuItem(actions, 'Remove');
    s.button('Remove and keep data').click(); await flush(); assert.deepEqual(s.calls.at(-1), ['remove', 'test.package', false]);
    assert.equal(s.row(), null);
    assert.ok(s.dom.window.document.activeElement === s.button('Add plugin'), 'Removing the last row returns focus to Add plugin');
  } finally { await s.stop(); }
});

test('built-in composition stages providers and suppression together through the shared Settings role', async () => {
  const s = await fixture({ composition: true });
  try {
    const [thirdParty, builtin] = s.view().querySelectorAll('[role=tab]');
    assert.equal(thirdParty.textContent, 'Third-party');
    assert.equal(thirdParty.getAttribute('aria-selected'), 'true');
    assert.equal(builtin.textContent, 'Built-in');
    builtin.click(); await flush();
    assert.equal(builtin.getAttribute('aria-selected'), 'true');
    assert.equal(s.row('test.core').querySelector('input[type=checkbox]'), null);
    const detailsButton = s.row('test.consumer').querySelector('button[aria-label="Details: test.consumer"]');
    assert.equal(detailsButton.getAttribute('aria-haspopup'), 'dialog');
    detailsButton.click(); await flush();
    const dialog = s.dom.window.document.querySelector('.lm-lime-overlay [role=dialog]');
    [...dialog.querySelectorAll('[role=tab]')].find(tab => tab.textContent === 'Dependencies').click(); await flush();
    const menu = dialog.querySelector('[aria-label="Provider test.dependency"]');
    menu.click(); await flush();
    assert.ok(s.dom.window.document.getElementById(menu.getAttribute('aria-controls')).closest('.lm-dropdown-overlay'));
    [...s.dom.window.document.querySelectorAll('[role=option]')].find(option => option.textContent.includes('test.third')).click(); await flush();
    s.button('Set provider').click(); await flush();
    assert.equal(s.calls.length, 0);
    s.button('Close').click(); await flush();
    s.row('test.first').querySelector('input').click(); await flush();
    assert.equal(s.row('test.first').querySelector('input').checked, false);
    assert.equal(s.calls.length, 0);
    thirdParty.click(); await flush();
    assert.equal(thirdParty.getAttribute('aria-selected'), 'true');
    assert.equal(s.row('test.first'), null);
    builtin.click(); await flush();
    assert.equal(s.row('test.first').querySelector('input').checked, false);
    s.button('Apply composition').click(); await flush();
    assert.deepEqual(s.calls.at(-1), ['applyComposition', {
      bindings: [{ consumerId: 'test.consumer', kind: 'api', contractId: 'test.dependency', providerId: 'test.third' }],
      disabledBuiltins: ['test.first'],
    }, 7]);
    s.button('Restore defaults').click(); await flush();
    s.button('Apply composition').click(); await flush();
    assert.deepEqual(s.calls.at(-1), ['applyComposition', { bindings: [], disabledBuiltins: [] }, 8]);
  } finally { await s.stop(); }
});

test('an owner can install a package without starting it before selecting a provider', async () => {
  const s = await fixture();
  try {
    s.button('Add plugin').click(); await flush();
    s.button('Install disabled').click(); await flush();
    assert.deepEqual(s.calls.at(-1), ['install', 1, false]);
    assert.equal(s.surface.querySelector('.lm-lime-package input[type=checkbox]').checked, false);
  } finally { await s.stop(); }
});

test('search finds installed packages and safe mode keeps their management list available', async () => {
  const s = await fixture();
  try {
    s.button('Add plugin').click(); await flush();
    s.button('Install plugin').click(); await flush();
    const search = s.search();
    assert.ok(search);
    typeInput(search, '  tEsT.PaCkAgE  '); await flush();
    assert.ok(s.row());
    typeInput(search, 'novel VIEW'); await flush();
    assert.ok(s.row());
    typeInput(search, 'missing plugin'); await flush();
    assert.equal(s.row(), null);
    assert.match(s.view().textContent, /No plugins found\./);
    s.press(search, 'Escape'); await flush();
    assert.equal(search.value, '');
    assert.ok(s.row());

    const safeMode = s.button('Open without third-party plugins');
    assert.ok(safeMode.closest('.lm-lime-overview'));
    safeMode.click(); await flush();
    assert.deepEqual(s.calls.at(-1), ['restore', true]);
    assert.match(s.view().textContent, /Third-party plugins are paused\./);
    assert.ok(s.row().querySelector('input[type=checkbox]').disabled);
    assert.ok(s.dom.window.document.activeElement === s.button('Resume third-party plugins'));
    s.button('Resume third-party plugins').click(); await flush();
    assert.deepEqual(s.calls.at(-1), ['restore', false]);
    assert.doesNotMatch(s.view().textContent, /Third-party plugins are paused\./);
    assert.equal(s.row().querySelector('input[type=checkbox]').disabled, false);
    assert.ok(s.dom.window.document.activeElement === safeMode);
  } finally { await s.stop(); }
});

test('pending removal offers retry with the recorded data choice', async () => {
  const s = await fixture();
  try {
    s.button('Add plugin').click(); await flush();
    s.button('Install plugin').click(); await flush();
    const actions = s.rowActions();
    s.failNextRemoval();
    await s.chooseMenuItem(actions, 'Remove');
    s.button('Remove and delete data').click(); await flush();
    assert.deepEqual(s.calls.at(-1), ['remove', 'test.package', true]);
    assert.match(s.row().textContent, /Removal pending/);
    assert.equal(s.button('Remove and keep data'), undefined);
    assert.ok(s.dom.window.document.activeElement === actions);
    await s.chooseMenuItem(actions, 'Retry removal');
    assert.deepEqual(s.calls.at(-1), ['remove', 'test.package', false]);
    assert.equal(s.row(), null);
  } finally { await s.stop(); }
});

test('cancel and locale/theme changes preserve the inherited surface and localized metadata', async () => {
  const s = await fixture();
  try {
    s.button('Add plugin').click(); await flush(); s.tools.localization.setLocale('ru'); await flush();
    assert.match(s.dom.window.document.querySelector('.lm-lime-overlay').textContent, /Новый инструмент/);
    s.button('Отмена').click(); await flush(); assert.deepEqual(s.calls.at(-1), ['cancel', 1]); assert.equal(s.calls.some(call => call[0] === 'install'), false);
    for (const theme of ['windows-xp', 'windows-xp-dark', 'monochrome']) {
      s.tools.themes.select(`lunaris.base-theme-engine.${theme}`); await flush();
      assert.equal(s.surface.querySelector('.lm-lime-settings').closest('.lm-root').style.backgroundColor, 'transparent');
    }
  } finally { await s.stop(); }
});

test('dependency details disclose affected plugins and use the themed provider menu with explicit apply', async () => {
  const s = await fixture();
  try {
    s.button('Add plugin').click(); await flush(); s.button('Install plugin').click(); await flush();
    const view = s.view(); const trigger = s.rowActions();
    const actions = await s.openMenu(trigger);
    const firstAction = actions.querySelector('[role=menuitem]');
    firstAction.focus(); s.press(firstAction, 'Escape'); await flush();
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.ok(s.dom.window.document.activeElement === trigger, 'Escape returns focus to row actions');
    await s.chooseMenuItem(trigger, 'Details');
    const details = s.dom.window.document.querySelector('.lm-lime-overlay [role=dialog]');
    assert.ok(details);
    assert.equal(view.querySelector('[role=dialog], dl, [role=tab]'), null);
    assert.equal(details.querySelector('dd').textContent, 'test.package');
    const [overview, dependencyTab] = details.querySelectorAll('[role=tab]');
    assert.equal(overview.getAttribute('aria-selected'), 'true');
    assert.ok([...details.querySelectorAll('dt')].every(term => term.textContent !== 'Dependencies'));
    dependencyTab.click(); await flush();
    assert.equal(dependencyTab.getAttribute('aria-selected'), 'true');
    const dependencies = s.dom.window.document.getElementById(dependencyTab.getAttribute('aria-controls'));
    const fixed = [...dependencies.querySelectorAll('li')].find(row => row.textContent.includes('test.fixed'));
    assert.match(fixed.textContent, /test.only 1.0.0/);
    assert.equal(fixed.querySelector('button'), null);
    assert.equal(dependencies.querySelectorAll('[role=combobox]').length, 1);
    assert.match(details.textContent, /Affected plugins: test.package, test.consumer/);
    assert.match(details.textContent, /No compatible provider installed/); assert.equal(details.querySelector('select'), null);
    const menu = () => details.querySelector('[aria-label="Provider test.dependency"]');
    menu().click(); await flush(); assert.equal(menu().getAttribute('aria-expanded'), 'true');
    assert.ok(s.dom.window.document.getElementById(menu().getAttribute('aria-controls')).closest('.lm-dropdown-overlay'));
    s.press(menu(), 'Escape'); await flush();
    assert.equal(menu().getAttribute('aria-expanded'), 'false');
    menu().click(); await flush();
    [...s.dom.window.document.querySelectorAll('[role=option]')].find(option => option.textContent.includes('test.second')).click(); await flush();
    assert.match(details.textContent, /Enable the chosen provider first/); assert.equal(s.button('Apply provider').disabled, true);
    menu().click(); await flush(); [...s.dom.window.document.querySelectorAll('[role=option]')].find(option => option.textContent.includes('test.third')).click(); await flush();
    assert.equal(s.calls.some(call => call[0] === 'selectProvider'), false);
    s.button('Apply provider').click(); await flush();
    assert.deepEqual(s.calls.at(-1), ['selectProvider','test.package','api','test.dependency','test.third',7]);
    assert.equal(s.button('Apply provider').disabled, true);
    assert.equal(view.closest('.lm-root').style.backgroundColor, 'transparent');
    s.press(menu(), 'Escape'); await flush();
    assert.equal(details.isConnected, false);
    assert.ok(s.dom.window.document.activeElement === trigger, 'Closing details returns focus to row actions');
    await s.chooseMenuItem(trigger, 'Details');
    assert.equal(s.dom.window.document.querySelector('.lm-lime-overlay [role=tab]').getAttribute('aria-selected'), 'true');
    s.button('Close').click(); await flush();
    assert.equal(s.dom.window.document.querySelector('.lm-lime-overlay'), null);
  } finally { await s.stop(); }
});
