import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';
import { useBrowser } from '../test/browser.mjs';
import { EditorView } from '@codemirror/view';
import { definePlugin } from '@lunaris/sdk';
import { HostSession, composeApplication } from '@lunaris/application-host';
import { createWebviewScheduler } from '@lunaris/application-host/scheduler';
import { createDevToolsLogger } from '@lunaris/dev-tools-logger';
import { createBrowserNavigation } from '@lunaris/browser-navigation';
import { AccountSession, AccountVaults, AccountAccess, ClientUpdates } from '@lunaris/remote';
import { Filesystem, FilesystemSources } from '@lunaris/filesystem';
import { Vault, VaultLocations } from '@lunaris/vault';
import { ActiveDocument, DocumentProtection } from '@lunaris/active-document';

async function until(condition, label) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) { if (await condition()) return; await new Promise(resolve => setTimeout(resolve, 15)); }
  assert.fail(`Timed out: ${label}`);
}
test('real server browser composition recovers drafts, gates updates and retires pending reads', async t => {
  const serverRoot = process.env.LUNARIS_SERVER_DIRECTORY ?? path.resolve('../lunaris-server');
  const { startApplication } = await import(pathToFileURL(path.join(serverRoot, 'src/application.mjs')).href);
  const { validateConfig } = await import(pathToFileURL(path.join(serverRoot, 'src/config.mjs')).href);
  const { packageBundle, activateBundle } = await import(pathToFileURL(path.join(serverRoot, 'src/bundles.mjs')).href);
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'lunaris-web-integration-'));
  const configuration = validateConfig({ port: 0 }, base);
  const source = path.join(base, 'bundle-source'); fs.mkdirSync(source); fs.writeFileSync(path.join(source, 'index.html'), 'browser fixture');
  const initialBuild = '00000000-0000-0000-0000-000000000001'; const updatedBuild = '00000000-0000-0000-0000-000000000002';
  packageBundle(configuration, source, { buildId: initialBuild }); activateBundle(configuration, initialBuild);
  const server = await startApplication(configuration, { writeLog: () => {} });
  const address = `http://127.0.0.1:${server.address.port}`;
  const nativeFetch = globalThis.fetch; let cookie = ''; let offline = false; let networkError;
  let holdReads = false; let readEntered = false; let readSettled = false; let holdShutdown = false;
  const readGate = Promise.withResolvers(); const shutdownEntered = Promise.withResolvers(); const shutdownGate = Promise.withResolvers();
  // Node fetch has no browser cookie jar. Emulate only that browser responsibility.
  globalThis.fetch = async (url, init) => {
    if (offline) throw TypeError('Simulated network interruption');
    const body = init.body ? JSON.parse(init.body) : null;
    const held = holdReads && body?.operation === 'readText' && body.args?.path === 'note.md';
    if (held) { readEntered = true; await readGate.promise; }
    // JSDOM and Node have different AbortSignal brands; cancellation is tested
    // separately at the transport boundary. Do not pass the DOM signal to Undici.
    const { signal: _signal, ...nativeInit } = init;
    let response;
    try { response = await nativeFetch(url, { ...nativeInit, headers: { ...init.headers, ...(cookie ? { Cookie: cookie } : {}) } }); }
    catch (error) { networkError = error.stack + '\n' + error.cause?.stack; throw error; }
    const next = response.headers.get('set-cookie'); if (next) cookie = next.split(';')[0];
    if (held) { await response.clone().arrayBuffer(); readSettled = true; }
    return response;
  };
  const dom = useBrowser(new JSDOM('<div id="application"></div>', { url: address, pretendToBeVisual: true }));
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: new IDBFactory() });
  Object.defineProperty(globalThis, 'Window', { configurable: true, value: dom.window.Window });
  Object.defineProperty(globalThis, 'MutationObserver', { configurable: true, value: dom.window.MutationObserver });
  dom.window.Range.prototype.getClientRects = () => [];
  dom.window.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  const target = dom.window.document.getElementById('application'); let api; let reloaded = 0;
  const tokens = { account: AccountSession, catalog: AccountVaults, access: AccountAccess, updates: ClientUpdates, fs: Filesystem, sources: FilesystemSources, vault: Vault, locations: VaultLocations, document: ActiveDocument };
  const bridge = definePlugin({ manifest: { manifestVersion: 1, id: 'test.web-bridge', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides: [],
    requires: Object.values(tokens).map(token => ({ kind: token.kind, id: token.id, range: `^${token.version}` })), permissions: ['account.access', 'application.update', 'filesystem.access', 'vault.access'], optionalPermissions: [] },
    activate(ctx) { api = Object.fromEntries(Object.entries(tokens).map(([key, token]) => [key, ctx.use(token)])); api.owner = ctx.signal; } });
  const slowConsumer = definePlugin({ manifest: { manifestVersion: 1, id: 'test.slow-consumer', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides: [],
    requires: [{ kind: 'api', id: DocumentProtection.id, range: '^1.0.0' }], permissions: ['vault.access'], optionalPermissions: [] }, activate(ctx) {
      ctx.use(DocumentProtection); ctx.scope.own({ async dispose() { if (holdShutdown) { shutdownEntered.resolve(); await shutdownGate.promise; } } });
    } });
  const logs = [];
  const session = new HostSession({ scheduler: createWebviewScheduler(), async load() {
    const definition = composeApplication(target, { art: 'Lunaris', mode: 'browser', buildId: initialBuild, extensions: { plugins: [bridge, slowConsumer], entrypoints: [bridge.manifest.id, slowConsumer.manifest.id], grants: { [bridge.manifest.id]: bridge.manifest.permissions, [slowConsumer.manifest.id]: slowConsumer.manifest.permissions } } });
    return { ...definition, plugins: definition.plugins.map(plugin => plugin.manifest.id === 'lunaris.dev-tools-logger' ? createDevToolsLogger({ output: Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level => [level, (...args) => logs.push(args)])) }) : plugin.manifest.id === 'lunaris.browser-navigation' ?
      createBrowserNavigation({ addEventListener: dom.window.addEventListener.bind(dom.window), removeEventListener: dom.window.removeEventListener.bind(dom.window), location: { reload() { reloaded++; } } }) : plugin) };
  } });
  t.after(async () => { readGate.resolve(); shutdownGate.resolve(); await session.stop(); globalThis.fetch = nativeFetch; await server.close(); dom.window.close(); fs.rmSync(base, { recursive: true, force: true }); });
  await session.start(); assert.equal(session.snapshot().phase, 'running', JSON.stringify(session.snapshot().incidents));
  assert.equal(session.snapshot().kernel.plugins.some(p => p.manifest.id.includes('tauri')), false);
  assert.ok(target.querySelector('.lm-account-access'));
  const connected = await api.account.connect(address, api.owner); assert.equal(connected.ok, true, JSON.stringify({ connected, networkError }));
  assert.equal((await api.account.register('alice', 'correct horse battery staple')).ok, true);
  assert.equal((await api.account.login('alice', 'correct horse battery staple')).ok, true);
  const created = await api.catalog.create('Web notes'); assert.equal(created.ok, true); api.access.open();
  const wrapped = api.sources.location('remote', created.value.location); assert.equal(wrapped.ok, true);
  const opened = await api.locations.open(wrapped.value); assert.equal(opened.ok, true, JSON.stringify(opened));
  let rootId = opened.value.id;
  assert.equal((await api.fs.writeText({ vaultId: rootId, path: 'note.md' }, '# Original', { mode: 'create' })).ok, true);
  assert.equal((await api.document.open({ vaultId: rootId, path: 'note.md' })).ok, true);
  await until(() => target.querySelector('.cm-editor'), 'editor mount');
  let editor = EditorView.findFromDOM(target.querySelector('.cm-editor'));
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: '# Recovered from this device' } });
  offline = true;
  const closed = await api.vault.close(); assert.equal(closed.ok, true, JSON.stringify(closed));
  const physical = path.join(base, 'userData', 'alice', `vault_${created.value.id}`, 'note.md'); assert.equal(fs.readFileSync(physical, 'utf8'), '# Original');
  offline = false;
  const reopened = await api.locations.open(wrapped.value); assert.equal(reopened.ok, true, JSON.stringify(reopened)); rootId = reopened.value.id;
  await api.document.open({ vaultId: rootId, path: 'note.md' });
  await until(() => target.querySelector('.cm-editor')?.textContent.includes('Recovered from this device'), 'draft restoration');
  editor = EditorView.findFromDOM(target.querySelector('.cm-editor'));
  editor.contentDOM.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true }));
  await until(() => fs.readFileSync(physical, 'utf8') === '# Recovered from this device', 'conditional remote save');
  packageBundle(configuration, source, { buildId: updatedBuild }); activateBundle(configuration, updatedBuild);
  assert.equal((await api.updates.check()).value, updatedBuild); await until(() => target.querySelector('.lm-client-update'), 'update notice');
  editor = EditorView.findFromDOM(target.querySelector('.cm-editor'));
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: '# Local pending changes' } });
  fs.writeFileSync(physical, '# External competing change');
  target.querySelector('.lm-client-update button').click();
  await until(() => target.querySelector('.lm-client-update [role=alert]'), 'conflict blocks reload'); assert.equal(reloaded, 0); assert.ok(api.vault.current());
  [...target.querySelectorAll('button')].find(button => button.textContent === 'Reload from disk').click();
  await until(() => [...target.querySelectorAll('button')].some(button => button.textContent === 'Discard changes and reload'), 'discard confirmation');
  [...target.querySelectorAll('button')].find(button => button.textContent === 'Discard changes and reload').click();
  await until(() => target.querySelector('.cm-editor')?.textContent.includes('External competing change'), 'explicit conflict recovery');
  target.querySelector('.lm-client-update button').click(); await until(() => reloaded === 1, 'save-gated reload');
  assert.equal(api.vault.current(), null);
  await until(() => target.querySelector('.lm-account-access'), 'account catalog returns after Vault close');
  await session.refresh(); assert.equal(session.snapshot().phase, 'running', JSON.stringify(session.snapshot().incidents));
  holdReads = true; holdShutdown = true;
  assert.equal((await api.locations.open(wrapped.value)).ok, true);
  await until(() => readEntered, 'pending note read');
  const stopping = session.stop(); await shutdownEntered.promise;
  readGate.resolve();
  // Let the real HTTP body and the editor continuation settle while its required
  // consumer deliberately holds ordered cleanup and providers are unavailable.
  await until(() => readSettled, 'late HTTP read completion');
  for (let index = 0; index < 3; index++) await new Promise(setImmediate);
  shutdownGate.resolve(); await stopping; assert.equal(session.snapshot().phase, 'stopped');
  assert.equal(session.snapshot().kernel.diagnostics.some(item => ['CLEANUP_FAILED', 'STOP_TIMEOUT'].includes(item.code)), false);
});
