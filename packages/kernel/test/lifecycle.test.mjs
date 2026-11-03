import test from 'node:test';
import assert from 'node:assert/strict';
import { createKernel } from '@lunaris/kernel';
import { defineApi, defineEvent, defineHook } from '@lunaris/sdk';
import { deferred, host, plugin, snapshot } from './helpers.mjs';

const Api = defineApi({ id: 'example.api', version: '1.0.0' });
const provides = { provides: [{ kind: 'api', id: Api.id, version: Api.version }] };

test('register validates without executing code; snapshots and kernel instances are isolated', async () => {
  const { kernel } = host();
  const other = host().kernel;
  let starts = 0;
  const definition = plugin('example.plugin', () => { starts++; });
  kernel.register(definition);
  assert.equal(starts, 0);
  assert.equal(snapshot(kernel).state, 'registered');
  assert.deepEqual(other.inspect().plugins, []);
  assert.throws(() => kernel.register(definition), { code: 'PLUGIN_DUPLICATE' });
  assert.throws(() => kernel.register(plugin('example.incompatible', undefined, { engine: '^0.2.0' })), { code: 'VERSION_INCOMPATIBLE' });
  assert.equal(kernel.inspect().plugins.length, 1);
  const view = kernel.inspect();
  assert.throws(() => { view.plugins[0].state = 'active'; }, TypeError);
  assert.throws(() => { view.plugins[0].manifest.permissions.push('example.write'); }, TypeError);
  assert.throws(() => view.plugins.pop(), TypeError);
  await assert.rejects(kernel.start('example.missing'), { code: 'PLUGIN_NOT_FOUND' });
  await kernel.stop('example.plugin');
  assert.equal(snapshot(kernel).state, 'registered');
});

test('success publishes only at commit, start/stop are idempotent, restart uses fresh activation', async () => {
  const { kernel, clock } = host();
  const entered = deferred();
  const gate = deferred();
  let activations = 0;
  let disposals = 0;
  kernel.register(plugin('example.plugin', async ctx => {
    activations++;
    ctx.provide(Api, { value() { return 'value'; } });
    entered.resolve(ctx);
    await gate.promise;
    return { dispose() { disposals++; } };
  }, provides));
  const first = kernel.start('example.plugin');
  const repeated = kernel.start('example.plugin');
  const ctx = await entered.promise;
  assert.ok(Object.isFrozen(ctx));
  assert.ok(Object.isFrozen(ctx.scope));
  assert.equal(snapshot(kernel).state, 'starting');
  assert.deepEqual(snapshot(kernel).contracts, []);
  gate.resolve();
  await Promise.all([first, repeated]);
  const old = snapshot(kernel).activationId;
  assert.equal(activations, 1);
  assert.deepEqual(snapshot(kernel).contracts, ['api:example.api@1.0.0']);
  await Promise.all([kernel.stop('example.plugin'), kernel.stop('example.plugin')]);
  assert.equal(disposals, 1);
  assert.equal(snapshot(kernel).ownedResources, 0);
  assert.deepEqual(snapshot(kernel).contracts, []);
  assert.equal(ctx.signal.aborted, true);
  await kernel.restart('example.plugin');
  assert.equal(activations, 2);
  assert.notEqual(snapshot(kernel).activationId, old);
  await kernel.stopAll();
  assert.equal(disposals, 2);
  assert.equal(clock.tasks.size, 0);
});

test('stop queued during activation waits and cleans up the committed scope', async () => {
  const { kernel } = host();
  const entered = deferred();
  const release = deferred();
  let cleaned = 0;
  kernel.register(plugin('example.plugin', async ctx => {
    ctx.scope.own({ dispose() { cleaned++; } });
    entered.resolve();
    await release.promise;
  }));
  const start = kernel.start('example.plugin');
  await entered.promise;
  const stop = kernel.stop('example.plugin');
  assert.equal(snapshot(kernel).state, 'starting');
  release.resolve();
  await Promise.all([start, stop]);
  assert.equal(snapshot(kernel).state, 'stopped');
  assert.equal(cleaned, 1);
});

test('activation rollback removes staging and continues through aggregate cleanup failures', async () => {
  const { kernel, clock } = host();
  const order = [];
  let attempt = 0;
  kernel.register(plugin('example.plugin', ctx => {
    ctx.provide(Api, { value() { return 1; } });
    ctx.scope.own({ dispose() { order.push('first'); } });
    ctx.scope.own({ dispose() { order.push('second'); throw new Error('private cleanup payload'); } });
    if (++attempt === 1) throw new Error('private activation payload');
  }, provides));
  await assert.rejects(kernel.start('example.plugin'), error => {
    assert.equal(error.code, 'ACTIVATION_FAILED');
    assert.ok(error.cause instanceof AggregateError);
    return true;
  });
  assert.equal(snapshot(kernel).state, 'failed');
  assert.deepEqual(snapshot(kernel).contracts, []);
  assert.equal(snapshot(kernel).ownedResources, 0);
  assert.deepEqual(order, ['second', 'first']);
  assert.ok(!JSON.stringify(kernel.inspect()).includes('private'));
  const old = snapshot(kernel).activationId;
  await kernel.start('example.plugin');
  assert.notEqual(snapshot(kernel).activationId, old);
  assert.equal(snapshot(kernel).state, 'active');
  await assert.rejects(kernel.stop('example.plugin'), { code: 'CLEANUP_FAILED' });
  assert.equal(snapshot(kernel).state, 'failed');
  assert.equal(snapshot(kernel).ownedResources, 0);
  assert.equal(clock.tasks.size, 0);
});

test('activation deadline closes SDK access; a stale completion cannot change a retry', async () => {
  const { kernel, clock } = host({ activationTimeoutMs: 20 });
  const entered = deferred();
  const oldReturn = deferred();
  const lateDisposed = deferred();
  const lateOwnedDisposed = deferred();
  let attempt = 0;
  let current;
  kernel.register(plugin('example.plugin', async ctx => {
    ctx.provide(Api, { value() { return 1; } });
    if (++attempt === 1) { entered.resolve(ctx); return oldReturn.promise; }
    current = ctx;
  }, provides));
  const start = kernel.start('example.plugin');
  const old = await entered.promise;
  assert.equal([...clock.tasks.values()][0].delayMs, 20);
  clock.fire();
  await assert.rejects(start, { code: 'ACTIVATION_TIMEOUT' });
  assert.equal(old.signal.aborted, true);
  assert.equal(snapshot(kernel).ownedResources, 0);
  await kernel.start('example.plugin');
  const freshId = snapshot(kernel).activationId;
  assert.notEqual(current.activationId, old.activationId);
  assert.throws(() => old.provide(Api, { value() {} }), { code: 'SCOPE_CLOSED' });
  assert.throws(() => old.scope.own({ dispose() { lateOwnedDisposed.resolve(); } }), { code: 'SCOPE_CLOSED' });
  oldReturn.resolve({ dispose() { lateDisposed.resolve(); } });
  await Promise.all([lateDisposed.promise, lateOwnedDisposed.promise]);
  assert.equal(snapshot(kernel).state, 'active');
  assert.equal(snapshot(kernel).activationId, freshId);
  assert.deepEqual(snapshot(kernel).contracts, ['api:example.api@1.0.0']);
  await kernel.stopAll();
  assert.equal(clock.tasks.size, 0);
});

test('late rejected activation is handled and diagnosed with its original activation ID', async () => {
  const { kernel, clock } = host();
  const entered = deferred();
  const pending = deferred();
  let attempt = 0;
  kernel.register(plugin('example.plugin', async ctx => {
    if (++attempt === 1) { entered.resolve(ctx); await pending.promise; }
  }));
  const start = kernel.start('example.plugin');
  const old = await entered.promise;
  clock.fire();
  await assert.rejects(start, { code: 'ACTIVATION_TIMEOUT' });
  await kernel.start('example.plugin');
  pending.reject(new Error('sensitive late payload'));
  // A fresh queued transition synchronizes after the rejection handlers.
  await kernel.start('example.plugin');
  assert.ok(kernel.inspect().diagnostics.some(d => d.code === 'ACTIVATION_FAILED' && d.activationId === old.activationId));
  assert.ok(!JSON.stringify(kernel.inspect()).includes('sensitive'));
  await kernel.stopAll();
});

test('stop deadline attempts remaining resources and does not claim a hanging resource was released', async () => {
  const { kernel, clock } = host({ stopTimeoutMs: 15 });
  const teardownEntered = deferred();
  const hanging = deferred();
  const restDisposed = deferred();
  kernel.register(plugin('example.plugin', ctx => {
    ctx.scope.own({ dispose() { restDisposed.resolve(); } });
    return { dispose() { teardownEntered.resolve(); return hanging.promise; } };
  }));
  await kernel.start('example.plugin');
  const stop = kernel.stop('example.plugin');
  await teardownEntered.promise;
  assert.equal([...clock.tasks.values()][0].delayMs, 15);
  clock.fire();
  await assert.rejects(stop, { code: 'STOP_TIMEOUT' });
  await restDisposed.promise;
  assert.equal(snapshot(kernel).state, 'failed');
  assert.ok(snapshot(kernel).ownedResources > 0);
  hanging.resolve();
  await kernel.stop('example.plugin');
  assert.equal(snapshot(kernel).ownedResources, 0);
  assert.equal(snapshot(kernel).state, 'stopped');
});

test('direct management reentry fails; independent requests remain queued', async () => {
  const { kernel } = host();
  kernel.register(plugin('example.plugin', async () => {
    await assert.rejects(kernel.start('example.plugin'), { code: 'LIFECYCLE_REENTRANT' });
  }));
  await Promise.all([kernel.start('example.plugin'), kernel.start('example.plugin')]);
  assert.equal(snapshot(kernel).state, 'active');
  await kernel.stopAll();
});

test('indirect asynchronous lifecycle self-wait is bounded by activation deadline', async () => {
  const { kernel, clock } = host();
  const queued = deferred();
  kernel.register(plugin('example.plugin', async () => {
    await Promise.resolve();
    const ownStop = kernel.stop('example.plugin');
    queued.resolve();
    await ownStop;
  }));
  const start = kernel.start('example.plugin');
  await queued.promise;
  clock.fire();
  await assert.rejects(start, { code: 'ACTIVATION_TIMEOUT' });
  await kernel.stop('example.plugin');
  assert.equal(snapshot(kernel).state, 'stopped');
});

test('missing dependencies, uncommitted dispatch and default-denied permissions fail explicitly', async () => {
  const { kernel } = host();
  const Event = defineEvent({ id: 'example.event', version: '1.0.0' });
  const Hook = defineHook({ id: 'example.hook', version: '1.0.0' });
  const Sensitive = defineApi({ id: 'example.sensitive', version: Api.version, providePermission: 'example.serve' });
  let called = false;
  kernel.register(plugin('example.required', () => { called = true; }, {
    requires: [{ kind: 'api', id: Api.id, range: '^1.0.0' }],
  }));
  await assert.rejects(kernel.start('example.required'), { code: 'PROVIDER_MISSING' });
  assert.equal(called, false);
  kernel.register(plugin('example.plugin', async ctx => {
    assert.equal(ctx.optional(Api), undefined);
    assert.equal(ctx.permissions.has('example.read'), false);
    assert.equal(await ctx.permissions.request('example.read'), false);
    await assert.rejects(ctx.permissions.request('example.unknown'), { code: 'PERMISSION_DENIED' });
    await assert.rejects(ctx.events.emit(Event, {}), { code: 'CONTRACT_UNAVAILABLE' });
    await assert.rejects(ctx.hooks.run(Hook, ''), { code: 'CONTRACT_UNAVAILABLE' });
  }, {
    provides: [{ kind: 'event', id: Event.id, version: Event.version }, { kind: 'hook', id: Hook.id, version: Hook.version }],
    requires: [{ kind: 'api', id: Api.id, range: '^1.0.0', optional: true }],
    permissions: ['example.serve'], optionalPermissions: ['example.read'],
  }));
  await kernel.start('example.plugin');
  kernel.register(plugin('example.sensitive-provider', ctx => { ctx.provide(Sensitive, { value() {} }); }, {
    provides: [{ kind: 'api', id: Sensitive.id, version: Sensitive.version }], permissions: ['example.serve'],
  }));
  await assert.rejects(kernel.start('example.sensitive-provider'), error => error.cause.code === 'PERMISSION_DENIED');
  await kernel.stopAll();
});

test('declaration, shape and validator failures roll back without publication', async () => {
  for (const [declarations, provideApi, causeCode] of [
    [{}, ctx => ctx.provide(Api, { value() {} }), 'CONTRACT_UNDECLARED'],
    [provides, ctx => ctx.provide(Api, { value: 1 }), 'VALIDATION_FAILED'],
    [provides, ctx => ctx.provide(defineApi({ id: Api.id, version: Api.version, validate: () => false }), { value() {} }), 'VALIDATION_FAILED'],
    [provides, ctx => ctx.provide(defineApi({ id: Api.id, version: Api.version, validate: () => 'truthy' }), { value() {} }), 'VALIDATION_FAILED'],
    [provides, ctx => { ctx.provide(Api, {}); ctx.provide(Api, {}); }, 'CONTRACT_METADATA_CONFLICT'],
  ]) {
    const { kernel } = host();
    kernel.register(plugin('example.plugin', provideApi, declarations));
    await assert.rejects(kernel.start('example.plugin'), error => {
      assert.equal(error.code, 'ACTIVATION_FAILED');
      assert.equal(error.cause.code, causeCode);
      return true;
    });
    assert.deepEqual(snapshot(kernel).contracts, []);
    assert.equal(snapshot(kernel).ownedResources, 0);
  }
});

test('stopAll uses reverse stable ID order, continues after failure, and diagnostics are bounded', async () => {
  const { kernel } = host({ diagnosticCapacity: 2 });
  const order = [];
  for (const id of ['example.b', 'example.a', 'example.c']) {
    kernel.register(plugin(id, () => ({ dispose() {
      order.push(id);
      if (id !== 'example.a') throw new Error('secret');
    } })));
    await kernel.start(id);
  }
  await assert.rejects(kernel.stopAll(), { code: 'CLEANUP_FAILED' });
  assert.deepEqual(order, ['example.c', 'example.b', 'example.a']);
  const diagnostics = kernel.inspect().diagnostics;
  assert.equal(diagnostics.length, 2);
  assert.ok(diagnostics[1].sequence > diagnostics[0].sequence);
  assert.ok(Object.isFrozen(diagnostics[0]));
  assert.ok(Object.isFrozen(diagnostics[0].cause));
  assert.ok(!JSON.stringify(kernel.inspect()).includes('secret'));
  assert.ok(kernel.inspect().plugins.every(p => p.ownedResources === 0));
});

test('kernel rejects missing scheduler and invalid deadline/capacity options', () => {
  assert.throws(() => createKernel(), { code: 'LIFECYCLE_INVALID' });
  for (const options of [{ activationTimeoutMs: 0 }, { stopTimeoutMs: Infinity }, { diagnosticCapacity: 0.5 }]) {
    assert.throws(() => host(options), { code: 'LIFECYCLE_INVALID' });
  }
});

test('an old registration disposable cannot remove a later registration with the same key', async () => {
  const { kernel } = host();
  let old;
  kernel.register(plugin('example.plugin', ctx => {
    old = ctx.provide(Api, { value() { return 'old'; } });
    old.dispose();
    ctx.provide(Api, { value() { return 'new'; } });
  }, provides));
  await kernel.start('example.plugin');
  old.dispose();
  assert.deepEqual(snapshot(kernel).contracts, ['api:example.api@1.0.0']);
  await kernel.stopAll();
  assert.equal(snapshot(kernel).ownedResources, 0);
});

test('conflicting concurrently staged metadata is checked at commit without exposing staging', async () => {
  const { kernel } = host();
  const firstEntered = deferred();
  const secondEntered = deferred();
  const firstGate = deferred();
  const secondGate = deferred();
  const conflicting = defineApi({ id: Api.id, version: Api.version, consumePermission: 'example.read' });
  kernel.register(plugin('example.first', async ctx => {
    ctx.provide(Api, {}); firstEntered.resolve(); await firstGate.promise;
  }, provides));
  kernel.register(plugin('example.second', async ctx => {
    ctx.provide(conflicting, {}); secondEntered.resolve(); await secondGate.promise;
  }, provides));
  const first = kernel.start('example.first');
  const second = kernel.start('example.second');
  await Promise.all([firstEntered.promise, secondEntered.promise]);
  assert.ok(kernel.inspect().plugins.every(p => p.contracts.length === 0));
  secondGate.resolve();
  await second;
  firstGate.resolve();
  await assert.rejects(first, error => error.cause.code === 'CONTRACT_METADATA_CONFLICT');
  assert.deepEqual(snapshot(kernel, 'example.first').contracts, []);
  assert.equal(snapshot(kernel, 'example.first').ownedResources, 0);
  assert.equal(snapshot(kernel, 'example.second').state, 'active');
  await kernel.stopAll();
});

test('independent kernels can activate the same ID with different local contract metadata', async () => {
  const a = host();
  const b = host();
  for (const [kernel, token] of [[a.kernel, Api], [b.kernel, defineApi({ id: Api.id, version: Api.version, consumePermission: 'example.read' })]]) {
    kernel.register(plugin('example.plugin', ctx => { ctx.provide(token, {}); }, provides));
    await kernel.start('example.plugin');
  }
  await a.kernel.stopAll();
  assert.equal(snapshot(b.kernel).state, 'active');
  await b.kernel.stopAll();
});

test('late invalid teardown and rejected late disposal are diagnosed after timeout', async () => {
  for (const returned of [42, { dispose() { return Promise.reject(new Error('late secret')); } }]) {
    const { kernel, clock } = host();
    const entered = deferred();
    const result = deferred();
    kernel.register(plugin('example.plugin', () => { entered.resolve(); return result.promise; }));
    const start = kernel.start('example.plugin');
    await entered.promise;
    clock.fire();
    await assert.rejects(start, { code: 'ACTIVATION_TIMEOUT' });
    result.resolve(returned);
    await kernel.stop('example.plugin');
    assert.ok(kernel.inspect().diagnostics.some(d => d.code === 'ACTIVATION_FAILED' || d.code === 'CLEANUP_FAILED'));
    assert.ok(!JSON.stringify(kernel.inspect()).includes('secret'));
  }
});
