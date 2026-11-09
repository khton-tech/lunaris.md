import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '@lunaris/sdk';
import { ActiveDocument, ActiveDocumentChanged, DocumentStatistics, DocumentStatisticsChanged } from '@lunaris/active-document';
import { FilesystemSources } from '@lunaris/filesystem';
import { AccountSession, AccountSessionChanged, ConnectionStatus, ConnectionChanged } from '@lunaris/remote';
import statusBar from '@lunaris/status-bar';
import { setupWorkspace, flush } from '../../../../tools/test/workspace.mjs';
const ok = value => ({ ok: true, value });
const fail = () => ({ ok: false, error: { code: 'UNSUPPORTED', message: 'Local storage' } });
async function setup(withStatistics = true) {
 const state = { active: null, statistics: null, remote: null, connection: null, account: null }; let publisher;
 const tokens = [ActiveDocument, ActiveDocumentChanged, FilesystemSources, ConnectionStatus, ConnectionChanged, AccountSession, AccountSessionChanged,
  ...(withStatistics ? [DocumentStatistics, DocumentStatisticsChanged] : [])];
 const provider = definePlugin({ manifest: { manifestVersion: 1, id: 'test.status-data', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js',
  provides: tokens.map(t => ({ kind: t.kind, id: t.id, version: t.version })), requires: [], permissions: [], optionalPermissions: [] }, activate(ctx) {
   publisher = ctx;
   ctx.provide(ActiveDocument, { current: () => state.active, open: async () => ok(null), close: async () => ok(null), relocate: async () => ok(null), reconcile: async () => ok(null) });
   ctx.provide(FilesystemSources, { list: () => [], location: fail, locationVisible: () => true, capabilitiesFor: fail, remoteIdentity: () => state.remote ? ok(state.remote) : fail() });
   ctx.provide(ConnectionStatus, { current: () => state.connection });
   ctx.provide(AccountSession, { current: () => state.account, connect: async () => fail(), register: async () => fail(), login: async () => fail(), logout: async () => ok(null) });
   if (withStatistics) ctx.provide(DocumentStatistics, { current: () => state.statistics });
 } });
 const s = await setupWorkspace({ plugins: [provider, statusBar], entrypoints: [statusBar.manifest.id], grants: { [statusBar.manifest.id]: statusBar.manifest.permissions } });
 return { ...s, state, async emit(token, value) { await publisher.events.emit(token, value); await flush(); } };
}
test('composed status bar shows local document counts, hides stale counts and follows Vault lifecycle', async () => {
 const s = await setup();
 try {
  assert.equal(s.surface.querySelector('.lm-status-bar'), null); await s.open();
  const bar = s.surface.querySelector('.lm-status-bar'); assert.ok(bar); assert.ok(bar.textContent.includes('No file open'));
  assert.equal(bar.closest('.lm-root').style.backgroundColor, 'transparent');
  assert.equal(bar.closest('.lm-root').dataset.sizing, 'content'); assert.equal(bar.closest('.lm-root').style.flex, '1 1 auto'); assert.equal(bar.closest('.lm-root').style.containerType, 'normal');
  assert.equal(bar.closest('.lm-workspace-bottom').parentElement.classList.contains('lm-workspace-main-pane'), true);
  s.state.active = { vaultId: s.service.current().id, path: 'folder/Пример.md' };
  s.state.statistics = { target: s.state.active, state: 'ready', words: 2, letters: 9 };
  await s.emit(ActiveDocumentChanged, { current: s.state.active });
  assert.equal(s.surface.querySelector('.lm-status-bar'), bar); assert.ok(bar.textContent.includes('Пример')); assert.ok(!bar.textContent.includes('Пример.md'));
  assert.equal(bar.querySelector('.lm-status-file').title, 'folder/Пример.md'); assert.ok(bar.querySelector('[aria-label="Words: 2"]')); assert.ok(bar.querySelector('[aria-label="Letters: 9"]')); assert.ok(!bar.textContent.includes('Words:')); assert.equal(bar.querySelector('.lm-status-counts').textContent, '29'); assert.equal(bar.querySelector('.lm-status-server'), null);
  s.state.statistics = { ...s.state.statistics, words: 4, letters: 20 }; await s.emit(DocumentStatisticsChanged, { current: s.state.statistics }); assert.ok(bar.querySelector('[aria-label="Letters: 20"]'));
  s.state.active = { ...s.state.active, path: 'other.md' }; await s.emit(ActiveDocumentChanged, { current: s.state.active }); assert.equal(bar.querySelector('.lm-status-counts'), null);
  s.state.statistics = { target: s.state.active, state: 'loading', words: null, letters: null }; await s.emit(DocumentStatisticsChanged, { current: s.state.statistics }); assert.equal(bar.querySelector('.lm-status-counts'), null);
  await s.open(); assert.ok(s.surface.querySelector('.lm-status-bar').textContent.includes('No file open'));
  await s.service.close(); await flush(); assert.equal(s.surface.querySelector('.lm-status-bar'), null);
 } finally { await s.stop(); }
});
test('server status matches the selected root and account epoch, including offline, expiry and recovery', async () => {
 const s = await setup();
 try {
  await s.open(); s.state.remote = { server: 'https://notes.example', accountId: 'a', vaultId: 'remote-vault' };
  s.state.connection = { server: 'https://notes.example', epoch: 'e1', state: 'connected' };
  s.state.account = { server: 'https://notes.example', account: { id: 'a', login: 'alice' }, epoch: 'e1' };
  await s.emit(ConnectionChanged, { state: 'connected', epoch: 'e1' });
  const bar = s.surface.querySelector('.lm-status-bar'); assert.equal(bar.querySelector('.lm-status-server').getAttribute('aria-label'), 'Server connected');
  s.state.connection.state = 'offline'; await s.emit(ConnectionChanged, { state: 'offline', epoch: 'e1' }); assert.equal(bar.querySelector('.lm-status-server').getAttribute('aria-label'), 'Server offline');
  s.state.connection.epoch = 'old'; await s.emit(ConnectionChanged, { state: 'offline', epoch: 'old' }); assert.equal(bar.querySelector('.lm-status-server').getAttribute('aria-label'), 'Server status unknown');
  s.state.connection = { server: 'https://elsewhere.example', epoch: 'e1', state: 'connected' }; await s.emit(ConnectionChanged, { state: 'connected', epoch: 'e1' }); assert.equal(bar.querySelector('.lm-status-server').getAttribute('aria-label'), 'Server status unknown');
  s.state.connection = { server: 'https://notes.example', epoch: 'e2', state: 'expired' }; s.state.account = null;
  await s.emit(AccountSessionChanged, { current: null }); assert.equal(bar.querySelector('.lm-status-server').getAttribute('aria-label'), 'Session expired');
  s.state.connection.state = 'connected'; s.state.account = { server: 'https://notes.example', account: { id: 'a', login: 'alice' }, epoch: 'e2' };
  await s.emit(AccountSessionChanged, { current: s.state.account }); assert.equal(bar.querySelector('.lm-status-server').getAttribute('aria-label'), 'Server connected');
  s.state.remote = null; await s.emit(ConnectionChanged, { state: 'connected', epoch: 'e2' }); assert.equal(bar.querySelector('.lm-status-server'), null);
 } finally { await s.stop(); }
});
test('status bar remains available without an editor statistics provider', async () => {
 const s = await setup(false); try { await s.open(); const bar = s.surface.querySelector('.lm-status-bar'); assert.ok(bar); assert.equal(bar.querySelector('.lm-status-counts'), null); } finally { await s.stop(); }
});
