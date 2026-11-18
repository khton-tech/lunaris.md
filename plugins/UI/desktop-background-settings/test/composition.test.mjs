import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '@lunaris/sdk';
import { DesktopBackground } from '@lunaris/window';
import controller from '@lunaris/desktop-background-settings';
import { setupWorkspace, openSettings, flush } from '../../../../tools/test/workspace.mjs';

test('the composed Mantine switch persists a global preference and relocalizes the tray', async () => {
  const changes = [];
  const platform = definePlugin({ manifest: {
    manifestVersion: 1, id: 'test.desktop', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js',
    provides: [{ kind: 'api', id: DesktopBackground.id, version: DesktopBackground.version }],
    requires: [], permissions: ['window.native'], optionalPermissions: [],
  }, activate(ctx) {
    ctx.provide(DesktopBackground, { supported: () => true, async configure(enabled, labels) { changes.push({ enabled, labels }); } });
  } });
  const preferences = new Map();
  const start = () => setupWorkspace({ settings: true, preferences, plugins: [controller, platform], entrypoints: [controller.manifest.id],
    grants: { [controller.manifest.id]: controller.manifest.permissions, [platform.manifest.id]: platform.manifest.permissions } });
  const application = await start();
  try {
    assert.equal(application.session.snapshot().phase, 'running');
    assert.equal(changes.at(-1).enabled, false);
    await application.open();
    await openSettings(application);
    const category = [...application.surface.querySelectorAll('.lm-settings-category')].find(button => button.textContent === 'Application');
    assert.ok(category);
    assert.ok(category.querySelector('svg'));
    category.click();
    await flush();
    const control = application.surface.querySelector('input[aria-label="Run in background"]');
    assert.ok(control);
    const heading = application.surface.querySelector('.lm-settings-page-header h1');
    assert.equal(heading.textContent, 'Application');
    assert.ok(heading.querySelector('svg'));
    assert.equal(control.checked, false);
    assert.equal(control.closest('.lm-root').style.backgroundColor, 'transparent');
    control.click();
    await flush();
    assert.equal(control.checked, true);
    assert.deepEqual(application.preferenceWrites, [{ pluginId: controller.manifest.id, key: 'runInBackground', value: true, target: { scope: 'global' } }]);
    assert.deepEqual(changes.at(-1), { enabled: true, labels: { open: 'Open Lunaris', quit: 'Quit' } });
    application.tools.localization.setLocale('ru');
    await flush();
    assert.equal(control.getAttribute('aria-label'), 'Работать в фоне');
    assert.equal(heading.textContent, 'Приложение');
    assert.ok(heading.querySelector('svg'));
    assert.deepEqual(changes.at(-1), { enabled: true, labels: { open: 'Открыть Lunaris', quit: 'Выйти' } });
  } finally { await application.stop(); }

  changes.length = 0;
  const restarted = await start();
  try { assert.equal(changes[0].enabled, true); }
  finally { await restarted.stop(); }
});
