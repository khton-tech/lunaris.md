import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { definePlugin } from '@lunaris/sdk';
import { TestScheduler } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Localization } from '@lunaris/localization';
import localization from '@lunaris/localization-manager';
import { HostSession } from '@lunaris/tauri';
import { mountSystemView } from '../dist/view.js';

const manifest = (id, provides = [], requires = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides, requires, permissions: [], optionalPermissions: [] });

test('host starts SDK localization and recovery stays English when its provider is excluded', async () => {
  let language;
  const logger = definePlugin({ manifest: manifest('test.logger', [{ kind: 'api', id: Logger.id, version: '1.0.0' }]), activate(ctx) {
    ctx.provide(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(name => [name, () => true])));
  } });
  const consumer = definePlugin({ manifest: manifest('test.app', [], [{ kind: 'api', id: Localization.id, range: '^1.0.0' }]), activate(ctx) {
    language = ctx.use(Localization);
    assert.equal(language.register(ctx.pluginId, { en: { title: 'Notes' } }, ctx.signal).ok, true);
  } });
  const session = new HostSession({ scheduler: new TestScheduler(), load: async () => ({ plugins: [logger, localization, consumer], entrypoints: ['test.app'] }) });
  const dom = new JSDOM('<div id="system"></div><div id="app"></div>');
  const root = dom.window.document.getElementById('system');
  const view = mountSystemView(root, dom.window.document.getElementById('app'), session);
  await session.start();
  assert.equal(session.snapshot().phase, 'running');
  assert.equal(language.text('test.app', 'title'), 'Notes');
  await session.disable(localization.manifest.id);
  assert.equal(session.snapshot().phase, 'fallback');
  assert.equal(root.lang, 'en');
  assert.match(root.textContent, /The application needs attention/);
  assert.match(root.textContent, /Retry/);
  await session.enable(localization.manifest.id);
  assert.equal(session.snapshot().phase, 'running');
  assert.equal(language.locale(), 'en');
  assert.equal(language.text('test.app', 'title'), 'Notes');
  assert.ok(!session.snapshot().kernel.diagnostics.some(item => item.code === 'CLEANUP_FAILED'));
  await session.stop(); view.dispose(); dom.window.close();
});
