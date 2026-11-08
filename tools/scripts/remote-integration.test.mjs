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
import { AccountSession, AccountVaults, AccountAccess } from '@lunaris/remote';
import { Filesystem, FilesystemSources } from '@lunaris/filesystem';
import { Vault, VaultLocations } from '@lunaris/vault';
import { ActiveDocument } from '@lunaris/active-document';

async function until(condition, label) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) { if (await condition()) return; await new Promise(resolve => setTimeout(resolve, 15)); }
  assert.fail(`Timed out: ${label}`);
}
test('real server -> shared browser composition -> editor -> offline draft -> reconnect -> real file', async t => {
  const serverRoot = process.env.LUNARIS_SERVER_DIRECTORY ?? path.resolve('../lunaris-server');
  const { startApplication } = await import(pathToFileURL(path.join(serverRoot, 'src/application.mjs')).href);
  const { validateConfig } = await import(pathToFileURL(path.join(serverRoot, 'src/config.mjs')).href);
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'lunaris-web-integration-'));
  const server = await startApplication(validateConfig({ port: 0 }, base), { writeLog: () => {} });
  const address = `http://127.0.0.1:${server.address.port}`;
  const nativeFetch = globalThis.fetch; let cookie = ''; let offline = false; let networkError;
  // Node fetch has no browser cookie jar. Emulate only that browser responsibility.
  globalThis.fetch = async (url, init) => {
    if (offline) throw TypeError('Simulated network interruption');
    // JSDOM and Node have different AbortSignal brands; cancellation is tested
    // separately at the transport boundary. Do not pass the DOM signal to Undici.
    const { signal: _signal, ...nativeInit } = init;
    let response;
    try { response = await nativeFetch(url, { ...nativeInit, headers: { ...init.headers, ...(cookie ? { Cookie: cookie } : {}) } }); }
    catch (error) { networkError = error.stack + '\n' + error.cause?.stack; throw error; }
    const next = response.headers.get('set-cookie'); if (next) cookie = next.split(';')[0]; return response;
  };
  const dom = useBrowser(new JSDOM('<div id="application"></div>', { url: address, pretendToBeVisual: true }));
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: new IDBFactory() });
  Object.defineProperty(globalThis, 'Window', { configurable: true, value: dom.window.Window });
  Object.defineProperty(globalThis, 'MutationObserver', { configurable: true, value: dom.window.MutationObserver });
  dom.window.Range.prototype.getClientRects = () => [];
  dom.window.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  const target = dom.window.document.getElementById('application'); let api;
  const tokens = { account: AccountSession, catalog: AccountVaults, access: AccountAccess, fs: Filesystem, sources: FilesystemSources, vault: Vault, locations: VaultLocations, document: ActiveDocument };
  const bridge = definePlugin({ manifest: { manifestVersion: 1, id: 'test.web-bridge', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides: [],
    requires: Object.values(tokens).map(token => ({ kind: token.kind, id: token.id, range: `^${token.version}` })), permissions: ['account.access', 'filesystem.access', 'vault.access'], optionalPermissions: [] },
    activate(ctx) { api = Object.fromEntries(Object.entries(tokens).map(([key, token]) => [key, ctx.use(token)])); api.owner = ctx.signal; } });
  const logs = [];
  const session = new HostSession({ scheduler: createWebviewScheduler(), async load() {
    const definition = composeApplication(target, { art: 'Lunaris', mode: 'browser', extensions: { plugins: [bridge], entrypoints: [bridge.manifest.id], grants: { [bridge.manifest.id]: bridge.manifest.permissions } } });
    return { ...definition, plugins: definition.plugins.map(plugin => plugin.manifest.id === 'lunaris.dev-tools-logger' ? createDevToolsLogger({ output: Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level => [level, (...args) => logs.push(args)])) }) : plugin) };
  } });
  t.after(async () => { await session.stop(); globalThis.fetch = nativeFetch; await server.close(); dom.window.close(); fs.rmSync(base, { recursive: true, force: true }); });
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
  assert.equal((await api.vault.close()).ok, true);
  await until(() => target.querySelector('.lm-account-access'), 'account catalog returns after Vault close');
  await session.refresh(); assert.equal(session.snapshot().phase, 'running', JSON.stringify(session.snapshot().incidents));
});
