import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '@lunaris/sdk';
import { createClientUpdates } from '@lunaris/client-updates';
import { ServerTransport, AccountSessionChanged, ClientUpdates } from '@lunaris/remote';
import { testHost, consumer } from '../../../../tools/testing/remote.mjs';
test('browser updates compare immutable build IDs and clear availability on rollback', async () => {
  const original = '00000000-0000-0000-0000-000000000001'; const newer = '00000000-0000-0000-0000-000000000002'; let active = original; let api;
  const host = testHost({ 'lunaris.client-updates': ['account.network', 'account.access'], 'test.consumer': ['application.update'] });
  host.installMock(ServerTransport, { current: () => null, connect() {}, register() {}, login() {}, logout() {}, request: async () => ({ ok: true, value: { buildId: active } }) });
  host.register(definePlugin({ manifest: { manifestVersion: 1, id: 'test.events', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides: [{ kind: 'event', id: AccountSessionChanged.id, version: '1.0.0' }], requires: [], permissions: [], optionalPermissions: [] }, activate() {} }));
  host.register(createClientUpdates(original)); host.register(consumer([ClientUpdates], ctx => { api = ctx.use(ClientUpdates); }, ['application.update']));
  await host.start('test.consumer'); assert.equal((await api.check()).value, null);
  active = newer; assert.equal((await api.check()).value, newer); assert.equal(api.available(), newer);
  active = original; assert.equal((await api.check()).value, null); await host.stopAll(); host.assertNoResources(); assert.deepEqual(host.diagnostics(), []);
});
