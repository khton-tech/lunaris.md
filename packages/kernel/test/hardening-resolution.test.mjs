import test from 'node:test';
import assert from 'node:assert/strict';
import { defineApi } from '@lunaris/sdk';
import { host, plugin } from './helpers.mjs';

function register(kernel, id, deps, order, version = '1.0.0', contract = id) {
  const token = defineApi({ id: contract, version });
  kernel.register(plugin(id, ctx => { order.push(id); ctx.provide(token, {}); }, {
    provides: [{ kind: 'api', id: contract, version }],
    requires: deps.map(([id, optional = false, range = '^1.0.0']) => ({ kind: 'api', id, optional, range })),
  }));
}

for (const registrationOrder of [['a', 'b', 'c'], ['c', 'a', 'b'], ['b', 'c', 'a']]) {
  test(`optional-cycle decisions survive unrelated and incoming graphs: ${registrationOrder}`, async () => {
    const { kernel } = host(); const order = [];
    // An incoming-only edge must not force this outsider into the startup closure.
    register(kernel, 'aaa.incoming', [['graph.b', true]], order);
    register(kernel, 'noise.first', [['noise.second']], order);
    register(kernel, 'noise.second', [['noise.first']], order);
    const next = { a: 'b', b: 'c', c: 'a' };
    for (const name of registrationOrder) register(kernel, `graph.${name}`, [[`graph.${next[name]}`, true]], order);
    await kernel.start('graph.a');
    assert.deepEqual(order, ['graph.c', 'graph.b', 'graph.a']);
    const state = kernel.inspect();
    assert.equal(state.plugins.find(p => p.manifest.id === 'graph.c').bindings[0].providerId, undefined);
    assert.equal(state.plugins.find(p => p.manifest.id === 'aaa.incoming').state, 'registered');
    assert.ok(state.diagnostics.some(d => d.code === 'DEPENDENCY_CYCLE' && d.pluginId === 'graph.c'));
    await kernel.stopAll();
  });
}

test('late provider registration updates existing consumer reachability and retains range filtering', async () => {
  const { kernel } = host(); const order = [];
  register(kernel, 'graph.consumer', [['graph.contract', false, '^2.0.0']], order);
  await assert.rejects(kernel.start('graph.consumer'), { code: 'PROVIDER_MISSING' });
  register(kernel, 'graph.old', [], order, '1.0.0', 'graph.contract');
  register(kernel, 'graph.current', [], order, '2.0.0', 'graph.contract');
  await kernel.start('graph.consumer');
  assert.deepEqual(order, ['graph.current', 'graph.consumer']);
  await kernel.stopAll();
});

test('selected provider excludes errors in an unselected candidate closure', async () => {
  const { kernel } = host(); const order = [];
  register(kernel, 'graph.good', [], order, '1.0.0', 'graph.contract');
  register(kernel, 'graph.bad', [['missing.contract']], order, '1.0.0', 'graph.contract');
  register(kernel, 'graph.consumer', [['graph.contract']], order);
  await assert.rejects(kernel.start('graph.consumer'), { code: 'PROVIDER_AMBIGUOUS' });
  kernel.selectProvider('graph.consumer', 'api', 'graph.contract', 'graph.good');
  await kernel.start('graph.consumer'); assert.deepEqual(order, ['graph.good', 'graph.consumer']);
  await kernel.stopAll();
});

test('an unrelated provider registered later still creates intentional ambiguity', async () => {
  const { kernel } = host(); const order = [];
  register(kernel, 'graph.first', [], order, '1.0.0', 'graph.contract');
  register(kernel, 'graph.consumer', [['graph.contract']], order);
  await kernel.start('graph.consumer'); await kernel.stop('graph.consumer');
  register(kernel, 'graph.second', [], order, '1.0.0', 'graph.contract');
  await assert.rejects(kernel.start('graph.consumer'), { code: 'PROVIDER_AMBIGUOUS' });
  await kernel.stopAll();
});
