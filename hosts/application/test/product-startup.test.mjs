import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';
import { useBrowser } from '../../../tools/test/browser.mjs';
import { composeApplication, HostSession } from '@lunaris/application-host';
import { TestScheduler } from '@lunaris/test';
import { definePlugin } from '@lunaris/sdk';
import { Logger } from '@lunaris/logging';

test('complete browser composition prepares its real plugin graph before mounting', async () => {
  const dom = useBrowser(new JSDOM('<div id="app"></div>', { url: 'https://lunaris.test/' }));
  const previous = globalThis.indexedDB; globalThis.indexedDB = new IDBFactory();
  const errors = [];
  const logger = definePlugin({ manifest: { manifestVersion: 1, id: 'test.logger', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js',
    provides: [{ kind: Logger.kind, id: Logger.id, version: Logger.version }], requires: [], permissions: [], optionalPermissions: [] }, activate(ctx) {
    ctx.provide(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, (...args) => { if (level === 'error') errors.push(args); return true; }])));
  } });
  const target = dom.window.document.getElementById('app'); let definition;
  const session = new HostSession({ scheduler: new TestScheduler(), async load() {
    definition = composeApplication(target, { art: 'L', mode: 'browser', extensions: { excludeBuiltins: ['lunaris.logger'], plugins: [logger], entrypoints: [], grants: {} } });
    assert.equal(definition.view.duringStartup, false);
    assert.ok(definition.entrypoints.indexOf('lunaris.base-theme-engine') < definition.entrypoints.indexOf('lunaris.theme-settings'));
    return definition;
  } });
  try {
    await session.start();
    assert.equal(session.snapshot().phase, 'running', JSON.stringify({ incidents: session.snapshot().incidents, errors }));
    assert.equal(session.snapshot().startup.state, 'loaded');
    assert.ok(target.childElementCount > 0);
    await session.stop();
    // First-run config creation probes an absent file through the real filesystem.
    assert.deepEqual(errors.filter(([id, , detail]) => !(id === 'lunaris.filesystem-provider' && detail?.code === 'NOT_FOUND' && detail?.data?.path === 'config.toml')), []);
  } finally { await session.stop(); globalThis.indexedDB = previous; dom.window.close(); }
});
