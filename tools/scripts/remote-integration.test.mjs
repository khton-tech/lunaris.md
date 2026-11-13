import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';
import { useBrowser, typeInput } from '../test/browser.mjs';
import { EditorView } from '@codemirror/view';
import { StateEffect } from '@codemirror/state';
import { definePlugin } from '@lunaris/sdk';
import { HostSession, composeApplication } from '@lunaris/application-host';
import { createWebviewScheduler } from '@lunaris/application-host/scheduler';
import { createDevToolsLogger } from '@lunaris/dev-tools-logger';
import { createBrowserNavigation } from '@lunaris/browser-navigation';
import { AccountSession, AccountVaults, AccountAccess, ClientUpdates } from '@lunaris/remote';
import { Filesystem, FilesystemSources } from '@lunaris/filesystem';
import { Vault, VaultLocations, VaultHistory } from '@lunaris/vault';
import { ActiveDocument, DocumentProtection } from '@lunaris/active-document';
import { Themes } from '@lunaris/themes';

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
  let holdReads = false; let readEntered = false; let readSettled = false; let holdShutdown = false; let noteReads = 0;
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
    if (body?.operation === 'readText' && body.args?.path === 'note.md') noteReads++;
    if (held) { await response.clone().arrayBuffer(); readSettled = true; }
    return response;
  };
  const dom = useBrowser(new JSDOM('<div id="application"></div>', { url: address, pretendToBeVisual: true }));
  // Match a browser HTTP IP origin rather than Node's secure-context Web Crypto.
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: dom.window.crypto });
  t.after(() => { if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto); else delete globalThis.crypto; });
  assert.equal(globalThis.crypto.subtle, undefined);
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: new IDBFactory() });
  Object.defineProperty(globalThis, 'Window', { configurable: true, value: dom.window.Window });
  Object.defineProperty(globalThis, 'MutationObserver', { configurable: true, value: dom.window.MutationObserver });
  dom.window.Range.prototype.getClientRects = () => [];
  dom.window.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  const target = dom.window.document.getElementById('application'); let api; let reloaded = 0;
  const tokens = { account: AccountSession, catalog: AccountVaults, access: AccountAccess, updates: ClientUpdates, fs: Filesystem, sources: FilesystemSources, vault: Vault, locations: VaultLocations, history: VaultHistory, document: ActiveDocument, themes: Themes };
  const bridge = definePlugin({ manifest: { manifestVersion: 1, id: 'test.web-bridge', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides: [],
    requires: Object.values(tokens).map(token => ({ kind: token.kind, id: token.id, range: `^${token.version}` })), permissions: ['account.access', 'application.update', 'filesystem.access', 'vault.access'], optionalPermissions: [] },
    activate(ctx) { api = Object.fromEntries(Object.entries(tokens).map(([key, token]) => [key, ctx.use(token)])); api.owner = ctx.signal; } });
  const slowConsumer = definePlugin({ manifest: { manifestVersion: 1, id: 'test.slow-consumer', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides: [],
    requires: [{ kind: 'api', id: DocumentProtection.id, range: '^1.0.0' }], permissions: ['vault.access'], optionalPermissions: [] }, activate(ctx) {
      ctx.use(DocumentProtection); ctx.scope.own({ async dispose() { if (holdShutdown) { shutdownEntered.resolve(); await shutdownGate.promise; } } });
    } });
  const logs = [];
  const session = new HostSession({ scheduler: createWebviewScheduler(), async load() {
    const definition = composeApplication(target, { art: 'Lunaris', mode: 'browser', defaultServer: address, buildId: initialBuild, extensions: { plugins: [bridge, slowConsumer], entrypoints: [bridge.manifest.id, slowConsumer.manifest.id], grants: { [bridge.manifest.id]: bridge.manifest.permissions, [slowConsumer.manifest.id]: slowConsumer.manifest.permissions } } });
    return { ...definition, plugins: definition.plugins.map(plugin => plugin.manifest.id === 'lunaris.dev-tools-logger' ? createDevToolsLogger({ output: Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level => [level, (...args) => logs.push(args)])) }) : plugin.manifest.id === 'lunaris.browser-navigation' ?
      createBrowserNavigation({ addEventListener: dom.window.addEventListener.bind(dom.window), removeEventListener: dom.window.removeEventListener.bind(dom.window), location: { reload() { reloaded++; } } }) : plugin) };
  } });
  t.after(async () => { readGate.resolve(); shutdownGate.resolve(); await session.stop(); globalThis.fetch = nativeFetch; await server.close(); dom.window.close(); fs.rmSync(base, { recursive: true, force: true }); });
  await session.start(); assert.equal(session.snapshot().phase, 'running', JSON.stringify(session.snapshot().incidents));
  assert.equal(api.themes.current()?.id, 'lunaris.base-theme-engine.monochrome');
  assert.equal(session.snapshot().kernel.plugins.some(p => p.manifest.id.includes('tauri')), false);
  await until(() => target.querySelector('input[autocomplete="username"]'), `login form: ${networkError ?? ''}`);
  [...target.querySelectorAll('.lm-account-access button')].find(button => button.textContent === 'Create account').click();
  await until(() => target.querySelector('input[autocomplete="new-password"]'), 'registration form');
  typeInput(target.querySelector('input[autocomplete="username"]'), 'alice');
  typeInput(target.querySelector('input[autocomplete="new-password"]'), 'correct horse battery staple');
  target.querySelector('.lm-account-access form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => api.account.current()?.account.login === 'alice' && [...target.querySelectorAll('.lm-account-access button')].some(button => button.textContent === 'Create vault') && !target.querySelector('.lm-account-access form input')?.disabled, 'registered account catalog');
  offline = true;
  [...target.querySelectorAll('.lm-account-toolbar button')].find(button => button.textContent === 'Trash').click();
  await until(() => target.querySelector('.lm-account-error')?.textContent.includes('unavailable'), 'catalog request error');
  assert.equal(target.querySelector('.lm-account-empty'), null, 'failed catalog is not empty');
  assert.equal(target.querySelector('.lm-account-row'), null, 'previous route entries are absent');
  offline = false;
  target.querySelector('[aria-label="Refresh"]').click();
  await until(() => target.querySelector('.lm-account-empty')?.textContent.includes('Trash is empty'), 'catalog retry');
  [...target.querySelectorAll('.lm-account-toolbar button')].find(button => button.textContent === 'Your vaults').click();
  await until(() => target.querySelector('.lm-account-empty')?.textContent.includes('No vaults here'), 'return to active catalog');
  target.querySelector('.lm-account-toolbar button[aria-expanded]').click();
  await until(() => target.querySelector('.lm-account-disclosure').getAttribute('aria-hidden') === 'false', 'create form disclosure');
  typeInput(target.querySelector('.lm-account-access form input'), 'Web notes');
  target.querySelector('.lm-account-access form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => api.vault.current(), 'created Vault opens automatically');
  const created = { ok: true, value: (await api.catalog.list()).value.find(vault => vault.name === 'Web notes') }; assert.ok(created.value);
  const wrapped = api.sources.location('remote', created.value.location); assert.equal(wrapped.ok, true);
  let rootId = api.vault.current().id;
  const physical = path.join(base, 'userData', 'alice', `vault_${created.value.id}`, 'note.md');
  assert.equal((await api.fs.writeText({ vaultId: rootId, path: 'note.md' }, '# Original', { mode: 'create' })).ok, true);
  assert.equal((await api.document.open({ vaultId: rootId, path: 'note.md' })).ok, true);
  await until(() => target.querySelector('.cm-editor'), 'editor mount');
  assert.equal(api.themes.current()?.id, 'lunaris.base-theme-engine.monochrome');
  let editor = EditorView.findFromDOM(target.querySelector('.cm-editor'));
  const editableStates = [];
  editor.dispatch({ effects: StateEffect.appendConfig.of(EditorView.updateListener.of(update => editableStates.push(update.state.facet(EditorView.editable)))) });
  editor.focus();
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: '# Autosave keeps focus' }, selection: { anchor: 7 } });
  await until(() => fs.readFileSync(physical, 'utf8') === '# Autosave keeps focus', 'two-second autosave');
  await new Promise(setImmediate);
  const readCount = noteReads; const previousTime = fs.statSync(physical).mtime;
  // Deliver a real, delayed server rescan for unchanged content after saving.
  fs.utimesSync(physical, previousTime, new Date(previousTime.getTime() + 1000));
  await until(() => noteReads > readCount, 'delayed server save echo');
  for (let index = 0; index < 3; index++) await new Promise(setImmediate);
  assert.equal(EditorView.findFromDOM(target.querySelector('.cm-editor')), editor);
  assert.equal(editor.hasFocus, true); assert.equal(editor.state.selection.main.head, 7);
  assert.equal(editableStates.includes(false), false, 'Save echoes must never disable the focused editor.');
  editor.dispatch({ changes: { from: 7, insert: ' typing continues' } });
  assert.ok(editor.state.doc.toString().includes(' typing continues'));
  // Retain the existing offline-recovery scenario's original disk fixture.
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: '# Original' } });
  editor.contentDOM.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true }));
  await until(() => fs.readFileSync(physical, 'utf8') === '# Original', 'restore recovery fixture');
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: '# Recovered from this device' } });
  offline = true;
  const closed = await api.vault.close(); assert.equal(closed.ok, true, JSON.stringify(closed));
  assert.equal(fs.readFileSync(physical, 'utf8'), '# Original');
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
  assert.ok((await api.history.list()).value.some(entry => entry.location.reference === wrapped.value.reference));
  assert.equal((await api.account.logout()).ok, true); assert.equal((await api.history.list()).value.length, 0);
  assert.equal((await api.account.register('bob', 'correct horse battery staple')).ok, true);
  assert.equal((await api.account.login('bob', 'correct horse battery staple')).ok, true);
  assert.equal((await api.history.list()).value.length, 0); assert.equal((await api.history.open(wrapped.value.reference)).error.code, 'NOT_FOUND');
  await api.account.logout(); await api.account.login('alice', 'correct horse battery staple');
  assert.ok((await api.history.list()).value.some(entry => entry.location.reference === wrapped.value.reference));
  const other = await api.catalog.create('Second Vault');
  assert.equal(other.ok, true);
  const secondLocation = api.sources.location('remote', other.value.location);
  assert.equal((await api.locations.open(secondLocation.value)).ok, true);
  await until(async () => (await api.history.list({ refreshLocations: false })).value[0]?.location.reference === secondLocation.value.reference, 'last Vault persisted');
  await session.stop();
  await session.start();
  await until(() => api.vault.current()?.name === 'Second Vault', 'last Vault restored on browser startup');
  assert.equal(api.sources.remoteIdentity(api.vault.current().id).value.vaultId, other.value.id);
  await session.stop();
  const trashed = await globalThis.fetch(`${address}/api/v1/vaults/${other.value.id}/trash`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-lunaris-request': '1' }, body: '{}',
  });
  assert.equal(trashed.status, 200);
  await session.start();
  await until(() => target.querySelector('.lm-account-row')?.textContent.includes('Web notes'), 'catalog fallback for last Vault in trash');
  assert.equal(api.vault.current(), null);
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
