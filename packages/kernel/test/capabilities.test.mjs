import test from 'node:test';
import assert from 'node:assert/strict';
import { defineApi } from '@lunaris/sdk';
import { deferred, host, plugin, snapshot } from './helpers.mjs';

const Api = defineApi({ id: 'example.api', version: '1.0.0' });
const advertised = (id = Api.id, version = '1.0.0') => ({ kind: 'api', id, version });
const required = (id = Api.id, optional = false, range = '^1.0.0') => ({ kind: 'api', id, range, optional });
function provider(kernel, id, value, extra = {}) {
  kernel.register(plugin(id, ctx => { ctx.provide(Api, { value() { return value; } }); }, { provides: [advertised()], ...extra }));
}

test('same consumer uses host-selected interchangeable providers; sync/async shapes and receiver are preserved', async () => {
  const { kernel } = host();
  provider(kernel, 'example.first', 'first'); provider(kernel, 'example.second', 'second');
  let handle;
  kernel.register(plugin('example.consumer', ctx => { handle = ctx.use(Api); }, { requires: [required()] }));
  await assert.rejects(kernel.start('example.consumer'), { code: 'PROVIDER_AMBIGUOUS' });
  kernel.selectProvider('example.consumer', 'api', Api.id, 'example.first');
  await kernel.start('example.consumer');
  const old = handle;
  const detached = handle.value;
  assert.equal(detached(), 'first');
  assert.throws(() => kernel.selectProvider('example.consumer', 'api', Api.id, 'example.second'), { code: 'LIFECYCLE_INVALID' });
  await kernel.stop('example.consumer');
  kernel.selectProvider('example.consumer', 'api', Api.id, 'example.second');
  await kernel.start('example.consumer');
  assert.equal(handle.value(), 'second');
  assert.throws(() => old.value(), { code: 'SCOPE_CLOSED' });
  assert.equal(snapshot(kernel, 'example.consumer').bindings[0].providerId, 'example.second');
  await kernel.stopAll();
});

test('version ranges, minor compatibility, missing providers and explicit incompatible selection', async () => {
  const { kernel } = host();
  const newer = defineApi({ id: Api.id, version: '1.2.0' });
  kernel.register(plugin('example.provider', ctx => { const impl = { value() { return this === impl ? 42 : 0; }, async later() { return 7; } }; ctx.provide(newer, impl); }, { provides: [advertised(Api.id, '1.2.0')] }));
  let handle;
  kernel.register(plugin('example.consumer', ctx => { handle = ctx.use(Api); }, { requires: [required()] }));
  await kernel.start('example.consumer');
  assert.equal(handle.value(), 42); assert.equal(await handle.later(), 7);
  kernel.register(plugin('example.missing', () => { throw new Error('must not execute'); }, { requires: [required(Api.id, false, '^2.0.0')] }));
  await assert.rejects(kernel.start('example.missing'), error => error.code === 'PROVIDER_MISSING' && error.cause.message.includes('1.2.0'));
  assert.throws(() => kernel.selectProvider('example.missing', 'api', Api.id, 'example.provider'), { code: 'PROVIDER_MISSING' });
  await kernel.stopAll();
});

test('branching graph uses stable topological order and stops required consumers before providers', async () => {
  const { kernel } = host(); const order = [];
  for (const [id, deps] of [['example.root', ['example.b', 'example.c']], ['example.b', ['example.z']], ['example.c', []], ['example.z', []]]) {
    const token = defineApi({ id, version: '1.0.0' });
    kernel.register(plugin(id, ctx => { order.push('+' + id); ctx.provide(token, {}); return { dispose() { order.push('-' + id); } }; }, {
      provides: [advertised(id)], requires: deps.map(dep => required(dep)),
    }));
  }
  await kernel.start('example.root');
  assert.deepEqual(order, ['+example.c', '+example.z', '+example.b', '+example.root']);
  await kernel.stop('example.z');
  assert.deepEqual(order.slice(4), ['-example.root', '-example.b', '-example.z']);
  assert.equal(snapshot(kernel, 'example.c').state, 'active');
  await kernel.stopAll();
});

test('diamond graph starts its shared leaf once and stops both dependency paths', async () => {
  const { kernel } = host(); let leaves = 0;
  for (const [id, deps] of [['example.root', ['example.b', 'example.c']], ['example.b', ['example.leaf']], ['example.c', ['example.leaf']], ['example.leaf', []]]) {
    const token = defineApi({ id, version: '1.0.0' });
    kernel.register(plugin(id, ctx => { if (id === 'example.leaf') leaves++; ctx.provide(token, {}); }, { provides: [advertised(id)], requires: deps.map(dep => required(dep)) }));
  }
  await kernel.start('example.root'); assert.equal(leaves, 1); await kernel.stop('example.leaf');
  assert.ok(kernel.inspect().plugins.every(item => item.state === 'stopped')); await kernel.stopAll();
});

test('required cycles explain their path before any plugin runs; optional cycles omit an edge', async () => {
  for (const optional of [false, true]) {
    const { kernel } = host(); let calls = 0;
    for (const [id, dep] of [['example.a', 'example.b'], ['example.b', 'example.a']]) {
      const token = defineApi({ id, version: '1.0.0' });
      kernel.register(plugin(id, ctx => { calls++; ctx.provide(token, {}); }, { provides: [advertised(id)], requires: [required(dep, optional)] }));
    }
    if (optional) { await Promise.all([kernel.start('example.a'), kernel.start('example.b')]); assert.equal(calls, 2); }
    else { await assert.rejects(kernel.start('example.a'), error => error.code === 'DEPENDENCY_CYCLE' && error.cause.message.includes('example.a -> example.b -> example.a')); assert.equal(calls, 0); }
    await kernel.stopAll();
  }
});

test('absent optional binding stays absent until restart; failed optional provider does not fail consumer', async () => {
  const { kernel } = host(); let handle;
  kernel.register(plugin('example.consumer', ctx => { handle = ctx.optional(Api); }, { requires: [required(Api.id, true)] }));
  await kernel.start('example.consumer'); assert.equal(handle, undefined);
  provider(kernel, 'example.provider', 1);
  await kernel.start('example.provider'); await kernel.start('example.consumer'); assert.equal(handle, undefined);
  await kernel.restart('example.consumer'); assert.equal(handle.value(), 1);
  const old = handle;
  await kernel.stop('example.provider');
  assert.equal(snapshot(kernel, 'example.consumer').state, 'active');
  assert.throws(() => old.value(), { code: 'PROVIDER_UNAVAILABLE' });
  await kernel.start('example.provider'); assert.throws(() => old.value(), { code: 'PROVIDER_UNAVAILABLE' });
  await kernel.stopAll();
  const other = host().kernel;
  other.register(plugin('example.failed', () => { throw 1; }, { provides: [advertised()] }));
  other.register(plugin('example.consumer', ctx => { assert.equal(ctx.optional(Api), undefined); }, { requires: [required(Api.id, true)] }));
  await other.start('example.consumer'); await other.stopAll();
});

test('provider errors propagate unchanged and cached methods cannot bypass registration loss', async () => {
  const { kernel } = host(); const sync = new Error('secret'); const asyncError = {};
  let registration; let handle; const disposed = deferred();
  kernel.register(plugin('example.provider', ctx => { registration = ctx.provide(Api, { value() { throw sync; }, async later() { throw asyncError; } }); }, { provides: [advertised()] }));
  kernel.register(plugin('example.consumer', ctx => { handle = ctx.use(Api); return { dispose() { disposed.resolve(); } }; }, { requires: [required()] }));
  await kernel.start('example.consumer');
  assert.throws(() => handle.value(), error => error === sync);
  await assert.rejects(handle.later(), error => error === asyncError);
  assert.ok(kernel.inspect().diagnostics.some(d => d.code === 'API_CALL_FAILED' && d.contractId === Api.id));
  assert.ok(!JSON.stringify(kernel.inspect()).includes('secret'));
  registration.dispose(); assert.throws(() => handle.value(), { code: 'PROVIDER_UNAVAILABLE' });
  await disposed.promise; await kernel.stop('example.consumer');
  assert.equal(snapshot(kernel, 'example.consumer').state, 'stopped'); await kernel.stopAll();
});

test('concurrent starts sharing a dependency activate it once', async () => {
  const { kernel } = host(); const entered = deferred(); const release = deferred(); let calls = 0;
  kernel.register(plugin('example.provider', async ctx => { calls++; ctx.provide(Api, {}); entered.resolve(); await release.promise; }, { provides: [advertised()] }));
  for (const id of ['example.a', 'example.b']) kernel.register(plugin(id, () => {}, { requires: [required()] }));
  const starts = [kernel.start('example.a'), kernel.start('example.b')]; await entered.promise; release.resolve();
  await Promise.all(starts); assert.equal(calls, 1); await kernel.stopAll();
});

test('an advertised API must actually be published before activation can commit', async () => {
  const { kernel } = host(); let consumerRan = false;
  kernel.register(plugin('example.provider', () => {}, { provides: [advertised()] }));
  kernel.register(plugin('example.consumer', () => { consumerRan = true; }, { requires: [required()] }));
  await assert.rejects(kernel.start('example.consumer'), { code: 'PROVIDER_UNAVAILABLE' });
  assert.equal(consumerRan, false); assert.deepEqual(snapshot(kernel, 'example.provider').contracts, []); await kernel.stopAll();
});
