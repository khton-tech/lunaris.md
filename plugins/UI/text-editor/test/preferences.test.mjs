import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '@lunaris/sdk';
import editor from '@lunaris/text-editor';
import { createPreferences } from '../dist/src/preferences.js';
import { setupWorkspace, flush } from '../../../../tools/test/workspace.mjs';

const contracts = new Set(['lunaris.logger', 'lunaris.config', 'lunaris.config-changed', 'lunaris.settings', 'lunaris.vault', 'lunaris.vault-changed', 'lunaris.localization', 'lunaris.locale-changed', 'lunaris.themes', 'lunaris.theme-changed']);
const controller = definePlugin({ manifest: { ...editor.manifest, provides: [], requires: editor.manifest.requires.filter(item => contracts.has(item.id)), permissions: ['config.access', 'vault.access'], optionalPermissions: [] },
  activate(ctx) { createPreferences(ctx, () => {}); } });
async function setup(config) {
  const s = await setupWorkspace({ settings: true, plugins: [controller], entrypoints: [controller.manifest.id], grants: { [controller.manifest.id]: controller.manifest.permissions }, config });
  assert.equal(s.session.snapshot().phase, 'running', JSON.stringify(s.session.snapshot().incidents));
  return s;
}
async function show(s) {
  s.tools.sidebar.select('lunaris.settings.navigation'); await flush();
  const category = [...s.surface.querySelectorAll('.lm-settings-category')].find(node => node.textContent === 'Editor');
  assert.ok(category); category.click(); await flush();
}

test('Editor settings use composed themed controls, retain inputs and inherit Workspace surfaces', async () => {
  const s = await setup(); await s.open(); await show(s);
  const combos = s.surface.querySelectorAll('.lm-settings-items [role=combobox]'); assert.equal(combos.length, 1);
  const sliders = s.surface.querySelectorAll('[role=slider]'); assert.equal(sliders.length, 2);
  assert.equal(s.surface.querySelectorAll('.lm-settings-items input[type=checkbox]').length, 1);
  assert.equal(s.surface.querySelector('select'), null);
  const main = s.surface.querySelector('.lm-workspace-main');
  const items = s.surface.querySelector('.lm-settings-items');
  assert.equal(items.closest('.lm-root').style.backgroundColor, 'transparent');
  sliders[0].dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true })); await flush();
  assert.equal(s.tools.settings.snapshot().items[0].value, 15);
  assert.deepEqual(s.preferenceWrites.at(-1), { pluginId: editor.manifest.id, key: 'fontSize', value: '15', target: { scope: 'vault', vaultId: 'vault-1' } });
  s.tools.themes.select('lunaris.base-theme-engine.windows-xp'); await flush();
  assert.equal(s.surface.querySelector('.lm-workspace-main'), main);
  assert.equal(s.surface.querySelector('.lm-settings-items [role=combobox]'), combos[0]);
  assert.equal(s.surface.querySelector('[role=slider]'), sliders[0]);
  const reset = s.surface.querySelector('.lm-setting-reset'); assert.equal(reset.disabled, false); reset.click(); await flush();
  assert.equal(s.preferenceWrites.at(-1).value, 'theme'); assert.equal(sliders[0].getAttribute('aria-valuenow'), '13');
  assert.equal(reset.disabled, true);
  assert.equal(items.closest('.lm-root').style.backgroundColor, 'transparent');
  await s.stop();
});

test('slider dragging updates its readout and saves only after release', async () => {
  const s = await setup(); await s.open(); await show(s);
  const root = s.surface.querySelector('.lm-setting-slider'); const track = root.querySelector('.mantine-Slider-trackContainer');
  // JSDOM has no native geometry; this verifies pointer behavior, not visual layout.
  track.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 20, right: 200, bottom: 20 });
  const move = async (target, type, x) => {
    target.dispatchEvent(new s.dom.window.MouseEvent(type, { clientX: x, clientY: 10, bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 30)); await flush();
  };
  await move(track, 'mousedown', 60); await move(s.dom.window.document, 'mousemove', 120);
  assert.equal(s.preferenceWrites.length, 0);
  assert.equal(root.querySelector('[role=slider]').getAttribute('aria-valuenow'), '24');
  assert.equal(root.parentElement.querySelector('.lm-setting-slider-value').textContent, '24 px');
  await move(s.dom.window.document, 'mouseup', 120);
  assert.equal(s.preferenceWrites.length, 1); assert.equal(s.preferenceWrites[0].value, '24');
  await s.stop();
});

test('late preference reads cannot leak into another Vault and cancelled callbacks cannot save', async () => {
  const pending = Promise.withResolvers();
  const s = await setup({ read: async (_, target) => target.vaultId === 'vault-1' ? pending.promise : { ok: true, value: { fontSize: '18' } } });
  await s.open(); const stale = s.tools.settings.snapshot().items[0];
  await s.open(); pending.resolve({ ok: true, value: { fontSize: '32' } }); await flush();
  assert.equal(s.tools.settings.snapshot().items[0].value, 18);
  await stale.onChange(24, { vaultId: 'vault-1', signal: s.ctx.signal });
  const owner = s.ctx.scope.child(); await owner.dispose();
  await stale.onChange(24, { vaultId: 'vault-2', signal: owner.signal });
  assert.equal(s.preferenceWrites.length, 0); await s.stop();
});

test('read failures expose retry and invalid saved values retain defaults without rewriting storage', async () => {
  let broken = true;
  const s = await setup({ read: async () => broken ? { ok: false, error: { code: 'IO_ERROR', message: 'Cannot read' } } : { ok: true, value: { fontSize: '999', lineHeight: '1.8' } } });
  await s.open();
  const item = s.tools.settings.snapshot().items[0]; assert.ok(item.onRetry);
  broken = false; await item.onRetry({ vaultId: 'vault-1', signal: s.ctx.signal }); await flush();
  assert.equal(s.tools.settings.snapshot().items[0].value, 14); assert.ok(s.tools.settings.snapshot().items[0].error);
  assert.equal(s.tools.settings.snapshot().items[1].value, 1.8); assert.equal(s.preferenceWrites.length, 0);
  await s.stop();
});
