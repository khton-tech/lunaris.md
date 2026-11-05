import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { definePlugin } from '@lunaris/sdk';
import { TestScheduler } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { createRunner } from '@lunaris/runner';
import { createThemeSettings } from '@lunaris/theme-settings';
import { createStartupProvider } from '@lunaris/startup-provider';
import { createTauriFilesystemDriver } from '@lunaris/tauri-filesystem';
import filesystem from '@lunaris/filesystem-provider';
import vaultManager from '@lunaris/vault-manager';
import configManager from '@lunaris/config-manager';
import localizationManager from '@lunaris/localization-manager';
import themeProvider from '@lunaris/theme-provider';
import baseTheme from '@lunaris/base-theme-engine';
import componentProvider from '@lunaris/component-provider';
import kit from '@lunaris/components-kit';
import { HostSession } from '@lunaris/tauri';
import { composeSlotSurface } from '../dist/slots.js';

test('runner and theme settings use persisted TOML via the real config/filesystem chain and recover after exclusion', async () => {
  const dom = new JSDOM('<div id="app"></div>'); const surface = dom.window.document.getElementById('app');
  const toml = '[plugins."lunaris.theme-settings"]\ntheme = "lunaris.base-theme-engine.light"\n[plugins."lunaris.runner"]\nshowDetails = false\n';
  const calls = []; let configText = toml;
  const ok = value => ({ ok: true, value }); const fail = code => ({ ok: false, error: { code, message: code } });
  const driver = createTauriFilesystemDriver({ async request(sessionId, operation, args) {
    calls.push(operation);
    if (['begin','end','closeVault'].includes(operation)) return ok(null);
    if (operation === 'openConfig') return ok({ id: 'settings', name: 'Settings' });
    if (operation === 'readText') return configText === null ? fail('NOT_FOUND') : ok({ text: configText, version: 'v1' });
    if (operation === 'writeText') { configText = args.text; return ok({ version: 'v2' }); }
    return fail('UNSUPPORTED');
  } });
  const logger = definePlugin({ manifest: { manifestVersion: 1, id: 'test.logger', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js',
    provides: [{ kind: 'api', id: Logger.id, version: Logger.version }], requires: [], permissions: [], optionalPermissions: [] }, activate(ctx) {
    ctx.provide(Logger, Object.fromEntries(['log','debug','info','warn','error'].map(level => [level, () => true])));
  } });
  const runner = createRunner({ art: 'LUNARIS' }); const settings = createThemeSettings({ defaultThemeId: 'lunaris.base-theme-engine.dark' });
  const session = new HostSession({ scheduler: new TestScheduler(), load: async () => {
    const startup = createStartupProvider(); const layout = composeSlotSurface(surface);
    return { ...layout, startup,
      plugins: [logger, driver, filesystem, vaultManager, configManager, localizationManager, themeProvider, baseTheme, componentProvider, kit, settings, runner, startup.plugin, ...layout.plugins],
      entrypoints: [startup.plugin.manifest.id, baseTheme.manifest.id, kit.manifest.id, configManager.manifest.id, settings.manifest.id, runner.manifest.id],
      grants: { ...layout.grants, [driver.manifest.id]: ['filesystem.native'], [filesystem.manifest.id]: ['filesystem.access','filesystem.app-config'],
        [vaultManager.manifest.id]: ['filesystem.access'], [configManager.manifest.id]: ['filesystem.access','filesystem.app-config','vault.access'],
        [settings.manifest.id]: ['config.access'], [runner.manifest.id]: ['config.access','ui.dom'], [componentProvider.manifest.id]: ['ui.dom'], [kit.manifest.id]: ['ui.dom'] },
    };
  } });
  await session.start(); assert.equal(session.snapshot().phase, 'running');
  assert.equal(surface.querySelector('[role=status]').textContent, 'System Loaded');
  assert.equal(surface.querySelector('section').style.backgroundColor, 'rgb(245, 247, 250)');
  assert.equal(configText, toml); assert.equal(calls.includes('writeText'), false); assert.equal(calls.includes('selectVault'), false);
  const old = surface.querySelector('section'); await session.disable(kit.manifest.id);
  assert.equal(session.snapshot().phase, 'fallback'); assert.equal(surface.childElementCount, 0); assert.equal(old.isConnected, false);
  await session.enable(kit.manifest.id); assert.equal(session.snapshot().phase, 'running');
  assert.equal(surface.querySelector('[role=status]').textContent, 'System Loaded');
  await session.stop(); assert.equal(surface.childElementCount, 0);
  assert.ok(!session.snapshot().incidents.some(item => item.origin === 'cleanup')); dom.window.close();
});
