import test from 'node:test';
import assert from 'node:assert/strict';
import provider from '@lunaris/drafts-provider';
import { Drafts, DraftStorage } from '@lunaris/remote';
import { testHost, consumer } from '../../../../tools/testing/remote.mjs';
test('draft provider rejects incomplete identity and contains storage failures', async () => {
  const host = testHost({ 'lunaris.drafts-provider': ['drafts.access'], 'test.consumer': ['drafts.access'] }); let api;
  host.installMock(DraftStorage, { list: async () => ({ok:true,value:[]}), load: async () => { throw Error('storage unavailable'); }, save: async () => ({ ok: true, value: null }), remove: async () => ({ ok: true, value: null }) }, { grants: ['drafts.storage'] });
  host.register(provider); host.register(consumer([Drafts], ctx => { api = ctx.use(Drafts); }, ['drafts.access'])); await host.start('test.consumer');
  assert.equal((await api.load({ vaultId: 'v', path: 'a.md' })).error.code, 'INVALID_ARGUMENT');
  assert.equal((await api.load({ server: 'https://s', accountId: 'a', vaultId: 'v', path: 'a.md' })).error.code, 'IO_ERROR');
  await host.stopAll(); host.assertNoResources();
});
