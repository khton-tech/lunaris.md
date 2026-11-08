import test from 'node:test';
import assert from 'node:assert/strict';
import account from '@lunaris/account-session';
import { AccountSession, ServerTransport } from '@lunaris/remote';
import { Vault } from '@lunaris/vault';
import { testHost, consumer } from '../../../../tools/testing/remote.mjs';
test('failed Vault release prevents logout and changing server', async () => {
  const host = testHost({ 'lunaris.account-session': ['vault.access', 'account.network'], 'test.consumer': ['account.access'] }); let api, ctx; let loggedOut = false;
  host.installMock(Vault, { current: () => ({ id: 'dirty', name: 'Dirty' }), open() {}, close: async () => ({ ok: false, error: { code: 'CONFLICT', message: 'Unsaved changes' } }) });
  host.installMock(ServerTransport, { current: () => null, connect() { throw Error('must not connect'); }, register() {}, login() {}, logout() { loggedOut = true; }, request() {} });
  host.register(account); host.register(consumer([AccountSession], context => { ctx = context; api = ctx.use(AccountSession); }, ['account.access']));
  await host.start('test.consumer'); assert.equal((await api.logout()).error.code, 'CONFLICT'); assert.equal(loggedOut, false);
  assert.equal((await api.connect('https://s', ctx.signal)).error.code, 'CONFLICT'); await host.stopAll(); host.assertNoResources();
});
