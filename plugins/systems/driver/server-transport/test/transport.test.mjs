import test from 'node:test';
import assert from 'node:assert/strict';
import { createServerTransport } from '@lunaris/server-transport';
import { ConnectionStatus, ServerTransport } from '@lunaris/remote';
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

test('connection snapshot follows failure, recovery and owner cancellation', async () => {
 let api, status, ctx; let offline = false; const host = testHost({ 'test.consumer': ['account.network', 'account.access'] });
 host.register(createServerTransport({ mode: 'desktop', fetch: async () => { if (offline) throw Error('Network unavailable'); return json({ protocol: 1, buildId: 'test', registration: 'open' }); } }));
 host.register(consumer([ServerTransport, ConnectionStatus], c => { ctx = c; api = c.use(ServerTransport); status = c.use(ConnectionStatus); }, ['account.network', 'account.access']));
 await host.start('test.consumer'); assert.equal(status.current(), null); const owner = ctx.scope.child();
 await api.connect('http://localhost:3100', owner.signal); assert.equal(status.current().state, 'connected'); assert.ok(Object.isFrozen(status.current()));
 offline = true; await api.request('GET', 'server'); assert.equal(status.current().state, 'offline');
 offline = false; await api.request('GET', 'server'); assert.equal(status.current().state, 'connected');
 await owner.dispose(); assert.equal(status.current(), null); await host.stopAll(); host.assertNoResources();
});

test('overlapping connection owners cannot borrow or retire another origin', async () => {
 const host = testHost({ 'test.consumer': ['account.network', 'account.access'] }); let api, status, ctx; const urls = [];
 host.register(createServerTransport({ mode: 'desktop', fetch: async url => { urls.push(url); return json({ protocol: 1, buildId: 'test', registration: 'open' }); } }));
 host.register(consumer([ServerTransport, ConnectionStatus], c => { ctx=c; api=c.use(ServerTransport); status=c.use(ConnectionStatus); }, ['account.network', 'account.access']));
 await host.start('test.consumer'); const a=ctx.scope.child(), b=ctx.scope.child();
 const first=api.connect('https://a.invalid',a.signal), second=api.connect('https://b.invalid',b.signal);
 assert.equal((await first).error.code,'CANCELLED'); assert.equal((await second).ok,true);
 assert.deepEqual(urls,['https://b.invalid/api/v1/server']);
 await a.dispose(); assert.equal(status.current().server,'https://b.invalid');
 await b.dispose(); assert.equal(status.current(),null); await host.stopAll(); host.assertNoResources();
});

test('JSON and plain 503 stay offline while business refusals preserve connectivity', async () => {
 const host=testHost({ 'test.consumer': ['account.network','account.access'] }); let api,status,ctx,response;
 host.register(createServerTransport({mode:'desktop',fetch:async()=>response??json({protocol:1,buildId:'test',registration:'open'})}));
 host.register(consumer([ServerTransport,ConnectionStatus],c=>{ctx=c;api=c.use(ServerTransport);status=c.use(ConnectionStatus);},['account.network','account.access']));
 await host.start('test.consumer'); await api.connect('https://a.invalid',ctx.signal);
 for (const body of ['Unavailable',JSON.stringify({ok:false,error:{code:'SERVER_UNAVAILABLE',message:'Unavailable'}})]) {
 response=new Response(body,{status:503}); assert.equal((await api.request('GET','server')).error.code,'SERVER_UNAVAILABLE'); assert.equal(status.current().state,'offline');
 }
 response=new Response(JSON.stringify({ok:false,error:{code:'INVALID_ARGUMENT',message:'Invalid'}}),{status:400});
 assert.equal((await api.request('GET','server')).error.code,'INVALID_ARGUMENT'); assert.equal(status.current().state,'connected');
 await host.stopAll(); host.assertNoResources();
});

test('oversized file content is rejected before serialization or fetch', async()=>{
 const {REMOTE_FILE_LIMITS}=await import('@lunaris/remote');const host=testHost({'test.consumer':['account.network']});let api,ctx,calls=0;
 host.register(createServerTransport({mode:'desktop',fetch:async()=>{calls++;return json({protocol:1,buildId:'test',registration:'open'});}}));
 host.register(consumer([ServerTransport],c=>{ctx=c;api=c.use(ServerTransport);},['account.network']));await host.start('test.consumer');await api.connect('https://a.invalid',ctx.signal);
 const body={operation:'writeFile',args:{data:Array(REMOTE_FILE_LIMITS.maxFileBytes+1).fill(255)},toJSON(){assert.fail('must reject before JSON serialization');}};
 assert.equal((await api.request('POST','vaults/id/files',body)).error.code,'TOO_LARGE');assert.equal(calls,1);await host.stopAll();host.assertNoResources();
});
