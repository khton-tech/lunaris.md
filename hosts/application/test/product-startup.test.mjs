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


for (const stalled of ['credentials', 'network']) test('desktop local storage starts while saved-session ' + stalled + ' is pending', async () => {
  const { createBrowserStorage } = await import('@lunaris/browser-storage');
  const { SessionCredentials } = await import('@lunaris/remote');
  const { ApplicationDirectory, Filesystem } = await import('@lunaris/filesystem');
  const dom = useBrowser(new JSDOM('<div id="app"></div>', { url: 'https://lunaris.test/' }));
  const previousIDB = globalThis.indexedDB, previousFetch = globalThis.fetch;
  globalThis.indexedDB = new IDBFactory();
  let fsApi, directory, owner, loadCalls = 0, networkCalls = 0, aborted = false;
  const pendingCredentials = Promise.withResolvers();
  const saved = { server: 'https://unreachable.example', account: { id: 'a', login: 'alice' }, token: 'test-only' };
  globalThis.fetch = (_url, init) => { networkCalls++; return new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => { aborted = true; reject(new DOMException('Stopped', 'AbortError')); }, { once: true });
  }); };
  const manifest = (id, provides, requires = [], permissions = []) => ({ manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides: provides.map(t => ({ kind: t.kind, id: t.id, version: t.version })), requires: requires.map(t => ({ kind: t.kind, id: t.id, range: '^1.0.0' })), permissions, optionalPermissions: [] });
  const credentials = definePlugin({ manifest: manifest('test.credentials', [SessionCredentials], [], ['credentials.native']), activate(ctx) {
    ctx.provide(SessionCredentials, { async load() { loadCalls++; assert.equal(session.snapshot().startup.state, 'loaded'); return stalled === 'credentials' ? pendingCredentials.promise : { ok: true, value: saved }; }, async save() { assert.fail(); }, async remove() { assert.fail(); } });
  } });
  const local = definePlugin({ manifest: manifest('test.local', [], [ApplicationDirectory, Filesystem], ['filesystem.access', 'filesystem.app-config']), activate(ctx) { owner = ctx.signal; directory = ctx.use(ApplicationDirectory); fsApi = ctx.use(Filesystem); } });
  const logger = definePlugin({ manifest: manifest('test.logger', [Logger]), activate(ctx) { ctx.provide(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, () => true]))); } });
  const session = new HostSession({ scheduler: new TestScheduler(), async load() {
    return composeApplication(dom.window.document.getElementById('app'), { art: 'L', mode: 'desktop', platformPlugins: [credentials], extensions: {
      excludeBuiltins: ['lunaris.logger', 'lunaris.browser-storage'], plugins: [logger, createBrowserStorage(), local], entrypoints: ['test.local'],
      grants: { 'lunaris.browser-storage': createBrowserStorage().manifest.permissions, 'test.credentials': ['credentials.native'], 'test.local': ['filesystem.access', 'filesystem.app-config'] },
    } });
  } });
  try {
    await session.start();
    assert.equal(session.snapshot().phase, 'running', JSON.stringify(session.snapshot().incidents));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(loadCalls, 1); assert.equal(networkCalls, stalled === 'network' ? 1 : 0);
    const root = await directory.openConfig(owner); assert.equal(root.ok, true);
    const target = { vaultId: root.value.id, path: 'offline-proof.md' };
    assert.equal((await fsApi.writeText(target, 'Local work', { mode: 'create' })).ok, true);
    assert.equal((await fsApi.readText(target)).value.text, 'Local work');
    assert.equal(session.snapshot().phase, 'running');
    assert.ok(dom.window.document.querySelector('.ln-vault'));
    await session.stop();
    if (stalled === 'network') assert.equal(aborted, true);
    pendingCredentials.resolve({ ok: true, value: saved });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(networkCalls, stalled === 'network' ? 1 : 0);
  } finally { await session.stop(); globalThis.fetch = previousFetch; globalThis.indexedDB = previousIDB; dom.window.close(); }
});
