import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '@lunaris/sdk';
import { TestScheduler } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Themes } from '@lunaris/themes';
import provider from '@lunaris/theme-provider';
import engine from '@lunaris/base-theme-engine';
import { HostSession } from '@lunaris/tauri';

const manifest = (id, provides = [], requires = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides, requires, permissions: [], optionalPermissions: [] });
test('desktop composition exposes the preset through the provider and supports engine exclusion/recovery', async () => {
  let themes;
  const logger = definePlugin({ manifest: manifest('test.logger', [{ kind: 'api', id: Logger.id, version: '1.0.0' }]), activate(ctx) {
    ctx.provide(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, () => true])));
  } });
  const consumer = definePlugin({ manifest: manifest('test.app', [], [{ kind: 'api', id: Themes.id, range: '^1.0.0' }]), activate(ctx) { themes = ctx.use(Themes); } });
  const session = new HostSession({ scheduler: new TestScheduler(), load: async () => ({ plugins: [logger, provider, engine, consumer], entrypoints: [engine.manifest.id, 'test.app'] }) });
  await session.start(); assert.equal(session.snapshot().phase, 'running');
  assert.deepEqual(themes.list().map(theme => theme.name).sort(), ['Catppuccin Mocha', 'Dracula', 'Everforest Dark', 'Gruvbox Dark', 'Monochrome', 'Nord', 'Rosé Pine', 'Sakura Night', 'Tokyo Night', 'Windows XP Luna', 'Windows XP Luna Dark']);
  themes.select('lunaris.base-theme-engine.monochrome'); assert.equal(themes.current().properties.colors.accent, '#E7E7E7');
  const stale = themes;
  await session.disable(engine.manifest.id); assert.equal(session.snapshot().phase, 'fallback'); assert.throws(() => stale.list());
  await session.enable(engine.manifest.id); assert.equal(session.snapshot().phase, 'running'); assert.equal(themes.list().length, 11);
  assert.equal(themes.current(), null);
  await session.stop(); assert.ok(!session.snapshot().kernel.diagnostics.some(item => item.code === 'CLEANUP_FAILED'));
});
