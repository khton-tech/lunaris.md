import test from 'node:test';
import assert from 'node:assert/strict';
import { createKernel } from '@lunaris/kernel';
import { definePlugin } from '@lunaris/sdk';
import { TestScheduler } from '@lunaris/test';
import { Config } from '@lunaris/config';
import { Logger } from '@lunaris/logging';
import { Themes } from '@lunaris/themes';
import themesProvider from '@lunaris/theme-provider';
import baseTheme from '@lunaris/base-theme-engine';
import { createThemeSettings } from '@lunaris/theme-settings';

const manifest = (id, provides = [], requires = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides, requires, permissions: [], optionalPermissions: [] });
const api = token => ({ kind: 'api', id: token.id, version: token.version });
async function setup(result, grant = true) {
  let themes; const logs = []; const reads = [];
  const logger = definePlugin({ manifest: manifest('test.logger', [api(Logger)]), activate(ctx) {
    ctx.provide(Logger, Object.fromEntries(['log','debug','info','warn','error'].map(name => [name, (...args) => { logs.push(args); return true; }])));
  } });
  const config = definePlugin({ manifest: manifest('test.config', [api(Config)]), activate(ctx) {
    ctx.provide(Config, { read: async id => { reads.push(id); return result; }, get() {}, set() {}, remove() {} });
  } });
  const reader = definePlugin({ manifest: manifest('test.reader', [], [{ kind: 'api', id: Themes.id, range: '^1.0.0' }]), activate(ctx) { themes = ctx.use(Themes); } });
  const settings = createThemeSettings({ defaultThemeId: 'lunaris.base-theme-engine.dark' });
  const kernel = createKernel({ scheduler: new TestScheduler() });
  for (const plugin of [logger, config, reader, settings, themesProvider, baseTheme]) kernel.register(plugin);
  if (grant) kernel.grant(settings.manifest.id, 'config.access');
  await kernel.start(baseTheme.manifest.id); await kernel.start('test.reader');
  return { kernel, settings, themes, logs, reads };
}

test('startup default and configured Light select through public Themes after reading config', async () => {
  for (const theme of [undefined, 'lunaris.base-theme-engine.light']) {
    const { kernel, settings, themes, reads } = await setup({ ok: true, value: theme ? { theme } : {} });
    assert.equal(themes.current(), null); await kernel.start(settings.manifest.id);
    assert.equal(themes.current().id, theme ?? 'lunaris.base-theme-engine.dark');
    assert.deepEqual(reads, ['lunaris.theme-settings']);
    await kernel.stopAll();
  }
});

test('unavailable theme degrades to default; invalid config and read failures preserve selection', async () => {
  const missing = await setup({ ok: true, value: { theme: 'missing.theme' } });
  await missing.kernel.start(missing.settings.manifest.id);
  assert.equal(missing.themes.current().id, 'lunaris.base-theme-engine.dark');
  assert.ok(missing.logs.some(args => args[2]?.code === 'THEME_NOT_FOUND')); await missing.kernel.stopAll();
  for (const result of [{ ok: true, value: { theme: 2 } }, { ok: false, error: { code: 'INVALID_TOML', message: 'Invalid config' } }]) {
    const { kernel, settings, themes, logs } = await setup(result);
    await assert.rejects(kernel.start(settings.manifest.id)); assert.equal(themes.current(), null);
    assert.ok(logs.some(args => args[2]?.code === 'THEME_SETTINGS_FAILED' && args[2].error instanceof Error));
    await kernel.stopAll();
  }
});

test('settings cannot access config without the declared grant', async () => {
  const { kernel, settings, reads } = await setup({ ok: true, value: {} }, false);
  await assert.rejects(kernel.start(settings.manifest.id)); assert.deepEqual(reads, []); await kernel.stopAll();
});
