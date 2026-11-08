import test from 'node:test';
import assert from 'node:assert/strict';
import account from '@lunaris/account-session';
import { AccountSession, AccountVaults, ServerTransport } from '@lunaris/remote';
import { Vault } from '@lunaris/vault';
import { FilesystemSources } from '@lunaris/filesystem';
import { testHost, consumer } from '../../../../tools/testing/remote.mjs';
test('failed Vault release prevents logout and changing server', async () => {
  const host = testHost({ 'lunaris.account-session': ['vault.access', 'filesystem.access', 'account.network'], 'test.consumer': ['account.access'] }); let api, ctx; let loggedOut = false;
  host.installMock(FilesystemSources, { list() {}, location() {}, locationVisible: () => true, capabilitiesFor() {}, remoteIdentity: () => ({ ok: true, value: { server: 'https://s', accountId: 'a', vaultId: 'v' } }) });
  host.installMock(Vault, { current: () => ({ id: 'dirty', name: 'Dirty' }), open() {}, close: async () => ({ ok: false, error: { code: 'CONFLICT', message: 'Unsaved changes' } }) });
  host.installMock(ServerTransport, { current: () => null, connect() { throw Error('must not connect'); }, register() {}, login() {}, logout() { loggedOut = true; }, request() {} });
  host.register(account); host.register(consumer([AccountSession], context => { ctx = context; api = ctx.use(AccountSession); }, ['account.access']));
  await host.start('test.consumer'); assert.equal((await api.logout()).error.code, 'CONFLICT'); assert.equal(loggedOut, false);
  assert.equal((await api.connect('https://s', ctx.signal)).error.code, 'CONFLICT'); await host.stopAll(); host.assertNoResources();
});
test('server logout keeps a local Vault open and trash only releases the matching remote Vault', async () => {
  const host = testHost({ 'lunaris.account-session': ['vault.access', 'filesystem.access', 'account.network'], 'test.consumer': ['account.access'] }); let api, catalog; let closes = 0; let remote = false;
  host.installMock(FilesystemSources, { list() {}, location() {}, locationVisible: () => true, capabilitiesFor() {}, remoteIdentity: () => remote ? { ok: true, value: { server: 'https://s', accountId: 'a', vaultId: 'active' } } : { ok: false, error: { code: 'UNSUPPORTED', message: 'Local root' } } });
  host.installMock(Vault, { current: () => ({ id: 'root', name: 'Notes' }), open() {}, close: async () => { closes++; return { ok: true, value: null }; } });
  host.installMock(ServerTransport, { current: () => ({ server: 'https://s', account: { id: 'a', login: 'alice' }, epoch: 'e' }), connect() {}, register() {}, login() {}, logout: async () => ({ ok: true, value: null }), request: async () => ({ ok: true, value: null }) });
  host.register(account); host.register(consumer([AccountSession, AccountVaults], ctx => { api = ctx.use(AccountSession); catalog = ctx.use(AccountVaults); }, ['account.access']));
  await host.start('test.consumer'); assert.equal((await api.logout()).ok, true); assert.equal(closes, 0);
  remote = true; assert.equal((await catalog.trash('another-vault')).ok, true); assert.equal(closes, 0);
  assert.equal((await catalog.trash('active')).ok, true); assert.equal(closes, 1); await host.stopAll(); host.assertNoResources();
});
