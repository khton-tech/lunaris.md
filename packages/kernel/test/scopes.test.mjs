import test from 'node:test';
import assert from 'node:assert/strict';
import { defineApi } from '@lunaris/sdk';
import { deferred, host, plugin, snapshot } from './helpers.mjs';

test('abort happens before teardown and nested resources dispose in exact reverse order', async () => {
  const { kernel } = host();
  const order = [];
  let context;
  kernel.register(plugin('example.plugin', ctx => {
    context = ctx;
    ctx.signal.addEventListener('abort', () => order.push('abort-root'));
    ctx.scope.own({ dispose() { order.push('first'); } });
    const child = ctx.scope.child();
    child.signal.addEventListener('abort', () => order.push('abort-child'), { once: true });
    child.own({ dispose() { order.push('child-first'); } });
    child.own({ async dispose() { order.push('child-last'); } });
    ctx.scope.own({ dispose() { order.push('last'); } });
    return { dispose() {
      assert.ok(ctx.signal.aborted && child.signal.aborted);
      order.push('teardown');
    } };
  }));
  await kernel.start('example.plugin');
  assert.ok(snapshot(kernel).ownedResources > 0);
  await kernel.stop('example.plugin');
  assert.deepEqual(order, ['abort-root', 'abort-child', 'teardown', 'last', 'child-last', 'child-first', 'first']);
  assert.throws(() => context.signal.throwIfAborted(), { code: 'SCOPE_CLOSED' });
  assert.throws(() => context.scope.child(), { code: 'SCOPE_CLOSED' });
  await context.scope.dispose();
  assert.equal(snapshot(kernel).ownedResources, 0);
});

test('child cleanup failures aggregate without preventing parent/other cleanup', async () => {
  const { kernel } = host();
  const order = [];
  kernel.register(plugin('example.plugin', ctx => {
    ctx.scope.own({ dispose() { order.push('parent'); } });
    const child = ctx.scope.child();
    child.own({ dispose() { order.push('child-first'); throw new Error('one'); } });
    child.own({ async dispose() { order.push('child-last'); throw new Error('two'); } });
  }));
  await kernel.start('example.plugin');
  await assert.rejects(kernel.stop('example.plugin'), error => {
    assert.equal(error.code, 'CLEANUP_FAILED');
    assert.ok(error.cause instanceof AggregateError);
    return true;
  });
  assert.deepEqual(order, ['child-last', 'child-first', 'parent']);
  assert.equal(snapshot(kernel).ownedResources, 0);
  assert.equal(snapshot(kernel).state, 'failed');
});

test('duplicate ownership and activation-returned teardown dispose once, teardown first', async () => {
  const { kernel } = host();
  const order = [];
  kernel.register(plugin('example.plugin', ctx => {
    const resource = { dispose() { order.push('same'); } };
    assert.equal(ctx.scope.own(resource), resource);
    ctx.scope.own(resource);
    ctx.scope.child().own(resource);
    ctx.scope.own({ dispose() { order.push('other'); } });
    return resource;
  }));
  await kernel.start('example.plugin');
  await kernel.stop('example.plugin');
  assert.deepEqual(order, ['same', 'other']);
  assert.equal(snapshot(kernel).ownedResources, 0);
});

test('concurrent independent disposal shares its result and released children leave no owned slots', async () => {
  const { kernel } = host();
  let context;
  kernel.register(plugin('example.plugin', ctx => { context = ctx; }));
  await kernel.start('example.plugin');
  let cleaned = 0;
  for (let i = 0; i < 10; i++) {
    const child = context.scope.child();
    child.own({ dispose() { cleaned++; } });
    const first = child.dispose();
    assert.equal(child.dispose(), first);
    await first;
  }
  assert.equal(cleaned, 10);
  assert.equal(snapshot(kernel).ownedResources, 0);
  await kernel.stopAll();
  assert.equal(cleaned, 10);
});

test('recursive disposal is rejected and remaining owned resources still run', async () => {
  const { kernel } = host();
  let cleaned = false;
  kernel.register(plugin('example.plugin', ctx => {
    ctx.scope.own({ dispose() { cleaned = true; } });
    ctx.scope.own({ dispose() { return ctx.scope.dispose(); } });
  }));
  await kernel.start('example.plugin');
  await assert.rejects(kernel.stop('example.plugin'), error => {
    assert.equal(error.cause.errors[0].code, 'LIFECYCLE_REENTRANT');
    return true;
  });
  assert.equal(cleaned, true);
  assert.equal(snapshot(kernel).ownedResources, 0);
});

test('deadline reaches resources inside a hanging child scope and in the parent', async () => {
  const { kernel, clock } = host();
  const entered = deferred();
  const parentReleased = deferred();
  const childReleased = deferred();
  const hanging = deferred();
  kernel.register(plugin('example.plugin', ctx => {
    ctx.scope.own({ dispose() { parentReleased.resolve(); } });
    const child = ctx.scope.child();
    child.own({ dispose() { childReleased.resolve(); } });
    child.own({ dispose() { entered.resolve(); return hanging.promise; } });
  }));
  await kernel.start('example.plugin');
  const stop = kernel.stop('example.plugin');
  await entered.promise;
  clock.fire();
  await assert.rejects(stop, { code: 'STOP_TIMEOUT' });
  await Promise.all([parentReleased.promise, childReleased.promise]);
  assert.ok(snapshot(kernel).ownedResources > 0);
  hanging.resolve();
  await kernel.stop('example.plugin');
  assert.equal(snapshot(kernel).ownedResources, 0);
});

test('abort listeners use snapshots, isolate throws/rejections and are removed after abort', async () => {
  const { kernel } = host();
  const order = [];
  const later = () => order.push('removed');
  let context;
  kernel.register(plugin('example.plugin', ctx => {
    context = ctx;
    ctx.signal.addEventListener('abort', () => {
      order.push('first');
      ctx.signal.removeEventListener('abort', later);
      ctx.signal.addEventListener('abort', () => order.push('late'));
      throw new Error('private listener error');
    });
    ctx.signal.addEventListener('abort', later);
    ctx.signal.addEventListener('abort', async () => { order.push('async'); throw new Error('private async error'); });
    ctx.scope.own({ dispose() { order.push('dispose'); } });
  }));
  await kernel.start('example.plugin');
  await kernel.stop('example.plugin');
  await context.scope.dispose();
  assert.deepEqual(order, ['first', 'async', 'dispose']);
  assert.equal(kernel.inspect().diagnostics.filter(d => d.code === 'CLEANUP_FAILED').length, 2);
  assert.ok(!JSON.stringify(kernel.inspect()).includes('private'));
});

test('manually closing a root scope invalidates publications immediately', async () => {
  const { kernel } = host();
  const Api = defineApi({ id: 'example.api', version: '1.0.0' });
  let context;
  kernel.register(plugin('example.plugin', ctx => {
    context = ctx;
    ctx.provide(Api, { value() {} });
  }, { provides: [{ kind: 'api', id: Api.id, version: Api.version }] }));
  await kernel.start('example.plugin');
  assert.equal(snapshot(kernel).contracts.length, 1);
  const disposal = context.scope.dispose();
  assert.deepEqual(snapshot(kernel).contracts, []);
  assert.equal(context.signal.aborted, true);
  assert.throws(() => context.permissions.has('example.read'), { code: 'SCOPE_CLOSED' });
  await disposal;
  await kernel.stop('example.plugin');
  assert.equal(snapshot(kernel).state, 'stopped');
});

test('a child disposer cannot recursively await disposal of its parent', async () => {
  const { kernel } = host();
  let cleaned = false;
  kernel.register(plugin('example.plugin', ctx => {
    ctx.scope.own({ dispose() { cleaned = true; } });
    ctx.scope.child().own({ dispose() { return ctx.scope.dispose(); } });
  }));
  await kernel.start('example.plugin');
  await assert.rejects(kernel.stop('example.plugin'), { code: 'CLEANUP_FAILED' });
  assert.equal(cleaned, true);
  assert.equal(snapshot(kernel).ownedResources, 0);
});

test('opaque thrown values cannot break diagnostics or interrupt remaining cleanup', async () => {
  const { kernel } = host();
  let cleaned = false;
  const opaque = new Proxy({}, { getPrototypeOf() { throw new Error('do not inspect'); } });
  kernel.register(plugin('example.plugin', ctx => {
    ctx.scope.own({ dispose() { cleaned = true; } });
    ctx.scope.own({ dispose() { throw opaque; } });
    throw opaque;
  }));
  await assert.rejects(kernel.start('example.plugin'), { code: 'ACTIVATION_FAILED' });
  assert.equal(cleaned, true);
  assert.equal(snapshot(kernel).ownedResources, 0);
  assert.ok(kernel.inspect().diagnostics.every(d => d.cause.kind === 'object'));
});
