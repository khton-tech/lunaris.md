import test from 'node:test';
import assert from 'node:assert/strict';
import { defineApi, defineEvent, defineHook } from '@lunaris/sdk';
import { deferred, host, plugin, snapshot } from './helpers.mjs';

const metadata = { id: 'example.restricted', version: '1.0.0', providePermission: 'example.serve', consumePermission: 'example.read' };
const Api = defineApi(metadata);
const provided = token => ({ kind: token.kind, id: token.id, version: token.version });
const required = token => ({ kind: token.kind, id: token.id, range: '^1.0.0' });
const restrictedGrants = { 'example.provider': ['example.serve'], 'example.consumer': ['example.read'] };
const profiles = {
  minimal: options => host(options),
  restricted: options => host({ initialGrants: restrictedGrants, ...options }),
};
function pair(kernel, activate, methods = { read() { return 'value'; } }, extra = {}) {
  kernel.register(plugin('example.provider', ctx => { ctx.provide(Api, methods); }, { provides: [provided(Api)], permissions: ['example.serve'] }));
  kernel.register(plugin('example.consumer', activate, { requires: [required(Api)], optionalPermissions: ['example.read'], ...extra }));
}

test('minimal profile never self-grants from a manifest and denial prevents provider activation', async () => {
  const { kernel } = profiles.minimal(); let operation = 0;
  pair(kernel, ctx => { ctx.use(Api).read(); }, { read() { operation++; } });
  await assert.rejects(kernel.start('example.consumer'), { code: 'PROVIDER_UNAVAILABLE' });
  assert.equal(snapshot(kernel, 'example.provider').state, 'failed'); assert.equal(operation, 0);
  assert.deepEqual(snapshot(kernel, 'example.provider').effectivePermissions, []);
  assert.ok(kernel.inspect().diagnostics.some(d => d.code === 'PERMISSION_DENIED' && d.contractId === Api.id));
  await kernel.stopAll();
});

test('restricted profile checks consumer and provider grants on every cached method invocation', async () => {
  const { kernel } = profiles.restricted(); let ctx; let handle; let calls = 0;
  pair(kernel, value => { ctx = value; handle = value.use(Api); }, { read() { calls++; return calls; } });
  await kernel.start('example.consumer'); const method = handle.read; assert.equal(method(), 1);
  kernel.revoke('example.consumer', 'example.read'); assert.equal(ctx.permissions.has('example.read'), false);
  assert.throws(method, { code: 'PERMISSION_DENIED' }); assert.equal(calls, 1);
  kernel.grant('example.consumer', 'example.read'); assert.equal(method(), 2);
  kernel.revoke('example.provider', 'example.serve'); assert.throws(method, { code: 'PERMISSION_DENIED' });
  kernel.grant('example.provider', 'example.serve'); assert.equal(method(), 3);
  const view = snapshot(kernel, 'example.consumer'); assert.deepEqual(view.effectivePermissions, ['example.read']);
  assert.throws(() => view.effectivePermissions.push('example.serve'), TypeError);
  assert.throws(() => kernel.grant('example.consumer', 'example.undeclared'), { code: 'PERMISSION_DENIED' });
  await kernel.stopAll();
});

test('optional requests delegate to host, coalesce pending requests, and make granted access effective', async () => {
  const approval = deferred(); const requested = deferred(); let callbacks = 0; let ctx;
  const { kernel } = host({ initialGrants: { 'example.provider': ['example.serve'] }, requestPermission: request => {
    assert.ok(Object.isFrozen(request)); assert.equal(request.pluginId, 'example.consumer'); assert.equal(request.permission, 'example.read');
    callbacks++; requested.resolve(); return approval.promise;
  } });
  pair(kernel, async value => {
    ctx = value; assert.equal(value.permissions.has('example.read'), false);
    const requests = [value.permissions.request('example.read'), value.permissions.request('example.read')];
    assert.deepEqual(await Promise.all(requests), [true, true]); assert.equal(value.use(Api).read(), 'value');
  });
  const start = kernel.start('example.consumer'); await requested.promise; approval.resolve(true); await start;
  assert.equal(callbacks, 1); assert.equal(await ctx.permissions.request('example.read'), true); assert.equal(callbacks, 1);
  await kernel.stopAll();
});

test('denied and failing host requests are deterministic and do not perform the operation', async () => {
  for (const fail of [false, true]) {
    const { kernel } = host({ initialGrants: { 'example.provider': ['example.serve'] }, requestPermission: () => {
      if (fail) throw new Error('private policy details'); return false;
    } });
    let calls = 0;
    pair(kernel, async ctx => {
      if (fail) await assert.rejects(ctx.permissions.request('example.read'), { code: 'PERMISSION_REQUEST_FAILED' });
      else assert.equal(await ctx.permissions.request('example.read'), false);
      assert.throws(() => ctx.use(Api), { code: 'PERMISSION_DENIED' });
    }, { read() { calls++; } });
    await kernel.start('example.consumer'); assert.equal(calls, 0);
    assert.ok(!JSON.stringify(kernel.inspect()).includes('private'));
    await kernel.stopAll();
  }
});

test('revocation generation prevents an older pending approval from restoring a grant', async () => {
  const requested = deferred(); const approval = deferred(); let result;
  const { kernel } = host({ requestPermission: () => { requested.resolve(); return approval.promise; } });
  kernel.register(plugin('example.consumer', async ctx => { result = await ctx.permissions.request('example.read'); }, { optionalPermissions: ['example.read'] }));
  const start = kernel.start('example.consumer'); await requested.promise;
  kernel.revoke('example.consumer', 'example.read'); approval.resolve(true); await start;
  assert.equal(result, false); assert.deepEqual(snapshot(kernel, 'example.consumer').effectivePermissions, []);
  await kernel.stopAll();
});

test('closed permission requests resolve denied and late approvals cannot grant a new activation', async () => {
  const requested = deferred(); const approval = deferred(); let context; let request; let attempt = 0;
  const { kernel, clock } = host({ requestPermission: () => { requested.resolve(); return approval.promise; } });
  kernel.register(plugin('example.consumer', ctx => {
    context = ctx; if (++attempt === 1) { request = ctx.permissions.request('example.read'); return request.then(() => {}); }
  }, { optionalPermissions: ['example.read'] }));
  const start = kernel.start('example.consumer'); await requested.promise; const old = context;
  clock.fire(); await assert.rejects(start, { code: 'ACTIVATION_TIMEOUT' }); assert.equal(await request, false);
  await kernel.start('example.consumer'); approval.resolve(true); await kernel.start('example.consumer');
  assert.equal(context.permissions.has('example.read'), false);
  await assert.rejects(old.permissions.request('example.read'), { code: 'SCOPE_CLOSED' });
  await kernel.stopAll();
});

test('mutable untyped token metadata cannot remove permission checks from an existing handle', async () => {
  const { kernel } = profiles.restricted(); let handle;
  const mutable = { ...Api };
  pair(kernel, ctx => { handle = ctx.use(mutable); });
  await kernel.start('example.consumer'); delete mutable.consumePermission;
  kernel.revoke('example.consumer', 'example.read'); assert.throws(() => handle.read(), { code: 'PERMISSION_DENIED' });
  await kernel.stopAll();
});

test('revocation affects future calls but cannot undo an already-running API method', async () => {
  const { kernel } = profiles.restricted(); const entered = deferred(); const finish = deferred(); let handle;
  pair(kernel, ctx => { handle = ctx.use(Api); }, { async read() { entered.resolve(); await finish.promise; return 'completed'; } });
  await kernel.start('example.consumer'); const call = handle.read(); await entered.promise;
  kernel.revoke('example.consumer', 'example.read'); assert.throws(() => handle.read(), { code: 'PERMISSION_DENIED' });
  finish.resolve(); assert.equal(await call, 'completed'); await kernel.stopAll();
});

test('event and hook grants are checked at registration and again between dispatch callbacks', async () => {
  for (const kind of ['event', 'hook']) {
    const Token = kind === 'event' ? defineEvent(metadata) : defineHook(metadata);
    const { kernel } = profiles.restricted(); let owner; let consumer; let calls = 0;
    kernel.register(plugin('example.provider', ctx => { owner = ctx; }, { provides: [provided(Token)], permissions: ['example.serve'] }));
    kernel.register(plugin('example.consumer', ctx => {
      consumer = ctx;
      const register = callback => kind === 'event' ? ctx.events.on(Token, callback) : ctx.hooks.register(Token, callback);
      register(value => { calls++; kernel.revoke('example.consumer', 'example.read'); return value; });
      register(value => { calls++; return value; });
    }, { requires: [required(Token)], optionalPermissions: ['example.read'] }));
    await kernel.start('example.consumer');
    const dispatch = () => kind === 'event' ? owner.events.emit(Token, '') : owner.hooks.run(Token, '');
    if (kind === 'event') await dispatch(); else await assert.rejects(dispatch(), { code: 'PERMISSION_DENIED' });
    assert.equal(calls, 1);
    assert.throws(() => kind === 'event' ? consumer.events.on(Token, () => {}) : consumer.hooks.register(Token, value => value), { code: 'PERMISSION_DENIED' });
    kernel.revoke('example.provider', 'example.serve'); await assert.rejects(dispatch(), { code: 'PERMISSION_DENIED' });
    await kernel.stopAll();
  }
});

test('permission checks run after validators and cannot be bypassed by validator-side revocation', async () => {
  const { kernel } = profiles.restricted(); let owner; let calls = 0;
  const Event = defineEvent(metadata);
  const Consumer = defineEvent({ ...metadata, validate: () => { kernel.revoke('example.consumer', 'example.read'); return true; } });
  kernel.register(plugin('example.provider', ctx => { owner = ctx; }, { provides: [provided(Event)], permissions: ['example.serve'] }));
  kernel.register(plugin('example.consumer', ctx => { ctx.events.on(Consumer, () => { calls++; }); }, { requires: [required(Event)], optionalPermissions: ['example.read'] }));
  await kernel.start('example.consumer'); await owner.events.emit(Event, ''); assert.equal(calls, 0); await kernel.stopAll();
});

test('initial grants are copied, must be declared, and required permissions cannot be requested as optional', async () => {
  const initial = { 'example.consumer': ['example.read'] }; const { kernel } = host({ initialGrants: initial });
  initial['example.consumer'].push('example.other');
  kernel.register(plugin('example.consumer', async ctx => {
    assert.equal(ctx.permissions.has('example.read'), true);
    await assert.rejects(ctx.permissions.request('example.read'), { code: 'PERMISSION_DENIED' });
  }, { permissions: ['example.read'] }));
  await kernel.start('example.consumer'); await kernel.stopAll();
  const other = host({ initialGrants: { 'example.consumer': ['example.other'] } }).kernel;
  assert.throws(() => other.register(plugin('example.consumer')), { code: 'PERMISSION_DENIED' }); assert.equal(other.inspect().plugins.length, 0);
});
