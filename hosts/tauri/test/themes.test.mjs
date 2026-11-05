import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { definePlugin } from '@lunaris/sdk';
import { TestScheduler } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Themes } from '@lunaris/themes';
import provider from '@lunaris/theme-provider';
import { HostSession } from '@lunaris/tauri';
import { mountSystemView } from '../dist/view.js';

const manifest = (id, provides = [], requires = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides, requires, permissions: [], optionalPermissions: [] });

test('host starts an empty theme provider; engine data never styles the host and recovery remains independent', async () => {
  let themes;
  const logger = definePlugin({ manifest: manifest('test.logger', [{ kind: 'api', id: Logger.id, version: '1.0.0' }]), activate(ctx) {
    ctx.provide(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(name => [name, () => true])));
  } });
  const engine = definePlugin({ manifest: manifest('test.engine', [], [{ kind: 'api', id: Themes.id, range: '^1.0.0' }]), activate(ctx) {
    themes = ctx.use(Themes);
    assert.equal(themes.current(), null); assert.deepEqual(themes.list(), []);
    assert.equal(themes.register({ id: 'test.engine.custom', name: 'Test engine', properties: {
      geometry: { regions: ['header', 'content'] }, colors: { background: '#123456' }, typography: { body: 'Fixture font' },
    } }, ctx.signal).ok, true);
    assert.equal(themes.select('test.engine.custom').ok, true);
  } });
  const session = new HostSession({ scheduler: new TestScheduler(), load: async () => ({ plugins: [logger, provider, engine], entrypoints: ['test.engine'] }) });
  const dom = new JSDOM('<div id="system"></div><div id="app"></div>');
  const root = dom.window.document.getElementById('system'); const application = dom.window.document.getElementById('app');
  const view = mountSystemView(root, application, session);
  await session.start(); assert.equal(session.snapshot().phase, 'running');
  assert.equal(themes.current().properties.geometry.regions[1], 'content');
  assert.equal(application.childElementCount, 0); assert.equal(application.getAttribute('style'), null);
  assert.equal(dom.window.document.documentElement.getAttribute('style'), null);
  await session.disable(provider.manifest.id); assert.equal(session.snapshot().phase, 'fallback');
  assert.equal(root.lang, 'en'); assert.match(root.textContent, /The application needs attention/);
  await session.enable(provider.manifest.id); assert.equal(session.snapshot().phase, 'running');
  assert.equal(themes.list().length, 1);
  await session.stop(); view.dispose(); dom.window.close();
  assert.ok(!session.snapshot().kernel.diagnostics.some(item => item.code === 'CLEANUP_FAILED'));
});
