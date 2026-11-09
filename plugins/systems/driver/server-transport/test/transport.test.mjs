import test from 'node:test';
import assert from 'node:assert/strict';
import { createServerTransport } from '@lunaris/server-transport';
import { ServerTransport } from '@lunaris/remote';
import { testHost, consumer } from '../../../../../tools/testing/remote.mjs';
const json = value => new Response(JSON.stringify({ ok: true, value }));
test('desktop bearer stays in transport; late responses cannot restore a cancelled account', async () => {
  let api, ctx; const calls = []; let delayed;
  const host = testHost({ 'test.consumer': ['account.network'] });
  host.register(createServerTransport({ mode: 'desktop', fetch: async (url, init) => {
    calls.push([url, init]);
    if (url.endsWith('/server')) return json({ protocol: 1, buildId: 'test', registration: 'open' });
    if (url.endsWith('/auth/login')) return json({ account: { id: 'a', login: 'alice' }, token: 'secret-token' });
    if (url.endsWith('/vaults')) return new Promise(resolve => { delayed = resolve; });
    return json(null);
  } }));
  host.register(consumer([ServerTransport], context => { ctx = context; api = ctx.use(ServerTransport); }, ['account.network']));
  await host.start('test.consumer'); const owner = ctx.scope.child(); await api.connect('http://localhost:3100', owner.signal);
  await api.login('alice', 'password'); assert.equal(api.current().account.login, 'alice'); assert.equal(JSON.stringify(api.current()).includes('secret-token'), false);
  const previousEpoch = api.current().epoch; await api.login('alice', 'password'); assert.notEqual(api.current().epoch, previousEpoch);
  const pending = api.request('GET', 'vaults'); assert.equal(calls.at(-1)[1].headers.Authorization, 'Bearer secret-token');
  await owner.dispose(); delayed(json([])); assert.equal((await pending).error.code, 'CANCELLED'); assert.equal(api.current(), null);
  await host.stopAll(); host.assertNoResources(); assert.deepEqual(host.diagnostics(), []);
});
test('incompatible discovery is rejected before authentication', async () => {
  const host = testHost({ 'test.consumer': ['account.network'] }); let api, ctx;
  host.register(createServerTransport({ mode: 'desktop', fetch: async () => json({ protocol: 99, buildId: 'test', registration: 'open' }) }));
  host.register(consumer([ServerTransport], context => { ctx = context; api = ctx.use(ServerTransport); }, ['account.network']));
  await host.start('test.consumer'); assert.equal((await api.connect('http://localhost:3100', ctx.signal)).error.code, 'PROTOCOL_MISMATCH');
  await host.stopAll(); host.assertNoResources();
});
test('a stalled server times out explicitly so save and release guards can preserve drafts', async () => {
  const host = testHost({ 'test.consumer': ['account.network'] }); let api, ctx;
  host.register(createServerTransport({ mode: 'desktop', timeoutMs: 10, fetch: (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('Request aborted', 'AbortError')), { once: true });
  }) }));
  host.register(consumer([ServerTransport], context => { ctx = context; api = ctx.use(ServerTransport); }, ['account.network']));
  await host.start('test.consumer'); assert.equal((await api.connect('http://localhost:3100', ctx.signal)).error.code, 'SERVER_UNAVAILABLE');
  await host.stopAll(); host.assertNoResources();
});
test('a response body that stalls after headers has the same recoverable timeout', async () => {
  const host = testHost({ 'test.consumer': ['account.network'] }); let api, ctx;
  host.register(createServerTransport({ mode: 'desktop', timeoutMs: 10, fetch: async (_url, init) => ({ status: 200,
    json: () => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Body aborted', 'AbortError')), { once: true })),
  }) }));
  host.register(consumer([ServerTransport], context => { ctx = context; api = ctx.use(ServerTransport); }, ['account.network']));
  await host.start('test.consumer'); assert.equal((await api.connect('http://localhost:3100', ctx.signal)).error.code, 'SERVER_UNAVAILABLE');
  await host.stopAll(); host.assertNoResources();
});
