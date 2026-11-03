import test from 'node:test';
import assert from 'node:assert/strict';
import { defineApi } from '@lunaris/sdk';
import { deferred, host, plugin, snapshot } from './helpers.mjs';

const api = defineApi({ id: 'disposal.api', version: '1.0.0' });
const provides = [{ kind: 'api', id: api.id, version: api.version }];
const requires = [{ kind: 'api', id: api.id, range: '^1.0.0' }];

test('root disposal serializes a fresh start behind asynchronous cleanup', async () => {
  const { kernel } = host();
  const entered = deferred(), finish = deferred();
  let context, handle, starts = 0;
  kernel.register(plugin('disposal.provider', ctx => {
    context = ctx;
    starts++;
    ctx.provide(api, { count() { return starts; } });
    return { async dispose() { entered.resolve(); await finish.promise; } };
  }, { provides }));
  kernel.register(plugin('disposal.consumer', ctx => { handle = ctx.use(api); }, { requires }));
  await kernel.start('disposal.consumer');
  const old = context;
  const disposal = old.scope.dispose();
  assert.equal(old.scope.dispose(), disposal);
  assert.equal(old.signal.aborted, true);
  assert.equal(snapshot(kernel, 'disposal.provider').state, 'stopping');
  assert.throws(() => handle.count(), { code: 'PROVIDER_UNAVAILABLE' });
  await entered.promise;
  const starting = kernel.start('disposal.consumer');
  assert.equal(starts, 1);
  finish.resolve();
  await disposal;
  await starting;
  assert.equal(starts, 2);
  assert.notEqual(context.activationId, old.activationId);
  assert.equal(context.signal.aborted, false);
  assert.equal(handle.count(), 2);
  await old.scope.dispose();
  assert.equal(context.signal.aborted, false);
  await kernel.stopAll();
});

test('root disposal waits for a required dependency chain and reentrant abort requests', async () => {
  const { kernel } = host();
  const entered = deferred(), finish = deferred();
  const order = [];
  let root, fromAbort;
  const middle = defineApi({ id: 'disposal.middle', version: '1.0.0' });
  kernel.register(plugin('disposal.provider', ctx => {
    root = ctx;
    ctx.signal.addEventListener('abort', () => { fromAbort = ctx.scope.dispose(); });
    ctx.provide(api, {});
    return { dispose() { order.push('provider'); } };
  }, { provides }));
  kernel.register(plugin('disposal.middle', ctx => {
    ctx.provide(middle, {});
    return { dispose() { order.push('middle'); } };
  }, { requires, provides: [{ kind: 'api', id: middle.id, version: middle.version }] }));
  kernel.register(plugin('disposal.consumer', () => ({
    async dispose() { entered.resolve(); await finish.promise; order.push('consumer'); },
  }), { requires: [{ kind: 'api', id: middle.id, range: '^1.0.0' }] }));
  await kernel.start('disposal.consumer');
  const disposal = root.scope.dispose();
  assert.equal(fromAbort, disposal);
  await entered.promise;
  assert.deepEqual(order, []);
  finish.resolve();
  await disposal;
  assert.deepEqual(order, ['consumer', 'middle', 'provider']);
  assert.ok(kernel.inspect().plugins.every(p => p.state === 'stopped' && p.ownedResources === 0));
});

for (const failure of ['rejection', 'timeout']) {
  test(`root disposal propagates dependent ${failure} and still releases provider resources`, async () => {
    const { kernel, clock } = host();
    const entered = deferred(), finish = deferred();
    let root, released = false;
    kernel.register(plugin('disposal.provider', ctx => {
      root = ctx;
      ctx.provide(api, {});
      return { dispose() { released = true; } };
    }, { provides }));
    kernel.register(plugin('disposal.consumer', () => ({
      async dispose() {
        entered.resolve();
        if (failure === 'rejection') throw new Error('consumer cleanup failed');
        await finish.promise;
      },
    }), { requires }));
    await kernel.start('disposal.consumer');
    const stopped = assert.rejects(root.scope.dispose(), { code: 'CLEANUP_FAILED' });
    await entered.promise;
    assert.equal(released, false);
    if (failure === 'timeout') clock.fire();
    await stopped;
    assert.equal(released, true);
    assert.equal(snapshot(kernel, 'disposal.provider').state, 'failed');
    assert.equal(clock.tasks.size, 0);
    finish.resolve();
    // Failed cleanup results remain retained; this assertion concerns bounded completion.
    await kernel.stopAll().catch(error => assert.equal(error.code, 'CLEANUP_FAILED'));
  });
}

test('root disposal during activation rolls back without waiting on its own lifecycle queue', async () => {
  const { kernel } = host();
  let cleaned = 0;
  kernel.register(plugin('disposal.starting', async ctx => {
    ctx.scope.own({ dispose() { cleaned++; } });
    await ctx.scope.dispose();
  }));
  await assert.rejects(kernel.start('disposal.starting'), error =>
    error.code === 'ACTIVATION_FAILED' && error.cause.code === 'SCOPE_CLOSED');
  assert.equal(cleaned, 1);
  assert.equal(snapshot(kernel, 'disposal.starting').state, 'failed');
  await kernel.stopAll();
});

test('an API callback can request coordinated root shutdown', async () => {
  const { kernel } = host();
  let handle;
  const order = [];
  kernel.register(plugin('disposal.provider', ctx => {
    ctx.provide(api, { shutdown() { return ctx.scope.dispose(); } });
    return { dispose() { order.push('provider'); } };
  }, { provides }));
  kernel.register(plugin('disposal.consumer', ctx => {
    handle = ctx.use(api);
    return { dispose() { order.push('consumer'); } };
  }, { requires }));
  await kernel.start('disposal.consumer');
  await handle.shutdown();
  assert.deepEqual(order, ['consumer', 'provider']);
  assert.equal(snapshot(kernel, 'disposal.provider').state, 'stopped');
});
