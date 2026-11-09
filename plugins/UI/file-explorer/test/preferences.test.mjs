import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '@lunaris/sdk';
import explorer from '@lunaris/file-explorer';
import { createPreferences } from '../dist/src/preferences.js';
import { setupWorkspace, flush } from '../../../../tools/test/workspace.mjs';

test('Files preferences compose with actual Settings navigation and themed menus', async () => {
  const contracts = new Set(['lunaris.logger', 'lunaris.config', 'lunaris.config-changed', 'lunaris.settings', 'lunaris.vault', 'lunaris.vault-changed', 'lunaris.localization', 'lunaris.locale-changed']);
  const controller = definePlugin({ manifest: { ...explorer.manifest, requires: explorer.manifest.requires.filter(item => contracts.has(item.id)), permissions: ['config.access', 'vault.access'] },
    activate(ctx) { createPreferences(ctx, () => {}); } });
  const s = await setupWorkspace({ settings: true, plugins: [controller], entrypoints: [controller.manifest.id], grants: { [controller.manifest.id]: controller.manifest.permissions } });
  assert.equal(s.session.snapshot().phase, 'running', JSON.stringify(s.session.snapshot().incidents));
  await s.open(); s.tools.sidebar.select('lunaris.settings.navigation'); await flush();
  const category = [...s.surface.querySelectorAll('.lm-settings-category')].find(node => node.textContent === 'Files'); assert.ok(category); category.click(); await flush();
  const input = s.surface.querySelector('.lm-settings-items [role=combobox]'); assert.ok(input);
  const toggle = s.surface.querySelector('.lm-settings-items input[type=checkbox]'); assert.ok(toggle.checked);
  input.click(); await flush();
  const list = s.dom.window.document.getElementById(input.getAttribute('aria-controls'));
  assert.deepEqual([...list.querySelectorAll('[role=option]')].map(node => node.textContent), ['Name: A–Z', 'Name: Z–A']);
  list.querySelectorAll('[role=option]')[1].click(); await flush();
  assert.equal(s.tools.settings.snapshot().items[0].value, 'desc');
  toggle.click(); await flush();
  assert.equal(s.tools.settings.snapshot().items[1].value, false);
  assert.deepEqual(s.preferenceWrites.map(write => write.key), ['sortDirection', 'revealActiveFile']);
  assert.equal(s.surface.querySelector('select'), null);
  assert.equal(s.surface.querySelector('.lm-settings-items').closest('.lm-root').style.backgroundColor, 'transparent');
  await s.stop();
});
