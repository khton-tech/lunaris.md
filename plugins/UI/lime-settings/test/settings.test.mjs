import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '@lunaris/sdk';
import { Lime, LimeChanged } from '@lunaris/lime';
import ui from '@lunaris/lime-settings';
import { setupWorkspace, flush } from '../../../../tools/test/workspace.mjs';

const ok = value => ({ ok: true, value });
const manifest = { manifestVersion: 1, id: 'test.package', version: '1.0.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './plugin.js', metadata: { name: '<img src=x> Novel view', author: 'Author', description: 'Long metadata '.repeat(30), languages: ['en', 'ru'], translations: { ru: { name: 'Новый инструмент' } }, platforms: ['desktop'], repository: 'https://example.com/plugin', fields: [{ label: 'License', value: 'MIT' }] }, provides: [], requires: [{ kind: 'api', id: 'test.dependency', range: '^1.0.0' }], permissions: [], optionalPermissions: [] };
async function fixture() {
  let state = { vaultId: 'vault-1', busy: false, safeMode: false, error: null, installations: [] }; let provider; const calls = [];
  const publish = async () => { await provider.events.emit(LimeChanged, state); };
  const plugin = definePlugin({ manifest: { ...manifest, id: 'test.engine', provides: [Lime, LimeChanged].map(token => ({ kind: token.kind, id: token.id, version: token.version })), requires: [] }, activate(ctx) {
    provider = ctx; ctx.provide(Lime, {
      snapshot: () => state,
      async preview() { calls.push(['preview']); return ok({ ticket: 1, manifest, digest: 'a'.repeat(64), platformWarning: true }); },
      cancelPreview(ticket) { calls.push(['cancel', ticket]); },
      async install(ticket) { calls.push(['install', ticket]); state = { ...state, installations: [{ id: manifest.id, version: manifest.version, digest: 'a'.repeat(64), manifest, enabled: true, recoveryRequired: false, removalPending: false, state: 'active' }] }; await publish(); return ok(null); },
      async update(ticket) { calls.push(['update', ticket]); return ok(null); },
      async enable(id) { calls.push(['enable', id]); return ok(null); },
      async disable(id) { calls.push(['disable', id]); state = { ...state, installations: state.installations.map(item => ({ ...item, enabled: false, state: 'disabled' })) }; await publish(); return ok(null); },
      async retry(id) { calls.push(['retry', id]); return ok(null); },
      async remove(id, deleteData) { calls.push(['remove', id, deleteData]); state = { ...state, installations: [] }; await publish(); return ok(null); },
      async restore(safeMode) { calls.push(['restore', safeMode]); state = { ...state, safeMode }; await publish(); return ok(null); },
    });
  } });
  const s = await setupWorkspace({ settings: true, plugins: [plugin, ui], entrypoints: [ui.manifest.id] });
  await s.open(); s.tools.sidebar.select('lunaris.settings.navigation'); await flush();
  [...s.surface.querySelectorAll('.lm-settings-category')].find(element => element.textContent === 'Third-party plugins').click(); await flush();
  const button = text => [...s.surface.querySelectorAll('.lm-lime-settings button')].find(element => element.textContent === text);
  return { ...s, calls, button };
}

test('Lime composes inside real Settings/Workspace and confirms preview before installation', async () => {
  const s = await fixture();
  try {
    const view = s.surface.querySelector('.lm-lime-settings'); const root = view.closest('.lm-root');
    assert.equal(root.dataset.presentation, 'embedded'); assert.equal(root.dataset.sizing, 'content'); assert.equal(root.style.backgroundColor, 'transparent');
    assert.match(view.textContent, /No third-party plugins installed/);
    s.button('Add plugin').click(); await flush();
    assert.deepEqual(s.calls, [['preview']]); assert.match(view.textContent, /test.dependency/); assert.match(view.textContent, /author has not declared support/);
    assert.equal(view.querySelector('img'), null); assert.equal(s.dom.window.document.activeElement.textContent, 'Install plugin');
    s.button('Install plugin').click(); await flush(); assert.ok(s.calls.some(call => call[0] === 'install'));
    assert.equal(s.dom.window.document.activeElement.textContent, 'Add plugin');
    const toggle = view.querySelector('input[type=checkbox]'); toggle.click(); await flush(); assert.deepEqual(s.calls.at(-1), ['disable', 'test.package']);
    s.button('Remove').click(); await flush(); assert.match(view.textContent, /retain its data and settings/);
    s.button('Remove and keep data').click(); await flush(); assert.deepEqual(s.calls.at(-1), ['remove', 'test.package', false]);
  } finally { await s.stop(); }
});

test('cancel and locale/theme changes preserve the inherited surface and localized metadata', async () => {
  const s = await fixture();
  try {
    s.button('Add plugin').click(); await flush(); s.tools.localization.setLocale('ru'); await flush();
    assert.match(s.surface.querySelector('.lm-lime-settings').textContent, /Новый инструмент/);
    s.button('Отмена').click(); await flush(); assert.deepEqual(s.calls.at(-1), ['cancel', 1]); assert.equal(s.calls.some(call => call[0] === 'install'), false);
    for (const theme of ['windows-xp', 'windows-xp-dark', 'monochrome']) {
      s.tools.themes.select(`lunaris.base-theme-engine.${theme}`); await flush();
      assert.equal(s.surface.querySelector('.lm-lime-settings').closest('.lm-root').style.backgroundColor, 'transparent');
    }
  } finally { await s.stop(); }
});
