import test from 'node:test';
import assert from 'node:assert/strict';
import { defineApi } from '@lunaris/sdk';
import { host, plugin, snapshot } from './helpers.mjs';

const Value = defineApi({ id: 'example.value', version: '1.0.0' });
const Relay = defineApi({ id: 'example.relay', version: '1.0.0' });
const provides = token => [{ kind: 'api', id: token.id, version: token.version }];
const requires = (token, optional = false) => [{ kind: 'api', id: token.id, range: '^1.0.0', ...(optional ? { optional } : {}) }];
async function fixture() {
  const { kernel } = host(); let old; let read; let fail = false; const starts = [];
  for (const [id, value] of [['example.first', 1], ['example.second', 2]]) kernel.register(plugin(id, ctx => { starts.push(id); ctx.provide(Value, { read: () => value }); }, { provides: provides(Value) }));
  kernel.register(plugin('example.consumer', ctx => {
    const api = ctx.use(Value); if (fail && api.read() === 2) throw Error('candidate not usable');
    old = api; ctx.provide(Relay, { read: () => api.read() }); starts.push('consumer');
  }, { provides: provides(Relay), requires: requires(Value) }));
  kernel.register(plugin('example.dependent', ctx => { const api = ctx.use(Relay); read = () => api.read(); starts.push('dependent'); }, { requires: requires(Relay) }));
  kernel.register(plugin('example.optional', ctx => { ctx.optional(Relay); starts.push('optional'); }, { requires: requires(Relay, true) }));
  kernel.selectProvider('example.consumer', 'api', Value.id, 'example.first');
  await kernel.start('example.dependent'); await kernel.start('example.optional'); await kernel.start('example.second');
  return { kernel, starts, get old() { return old; }, read: () => read(), fail() { fail = true; } };
}

test('provider rebinding restarts affected required/optional consumers and preserves unrelated providers', async () => {
  const f = await fixture(); const previous = f.old;
  const firstActivation = snapshot(f.kernel, 'example.first').activationId; const secondActivation = snapshot(f.kernel, 'example.second').activationId;
  await f.kernel.rebindProvider('example.consumer', 'api', Value.id, 'example.second');
  assert.equal(f.read(), 2); assert.throws(() => previous.read(), { code: 'SCOPE_CLOSED' });
  assert.equal(snapshot(f.kernel, 'example.first').activationId, firstActivation); assert.equal(snapshot(f.kernel, 'example.second').activationId, secondActivation);
  assert.equal(f.starts.filter(id => id === 'consumer').length, 2); assert.equal(f.starts.filter(id => id === 'dependent').length, 2); assert.equal(f.starts.filter(id => id === 'optional').length, 2);
  const current = snapshot(f.kernel, 'example.consumer').activationId;
  await f.kernel.rebindProvider('example.consumer', 'api', Value.id, 'example.second'); assert.equal(snapshot(f.kernel, 'example.consumer').activationId, current);
  await f.kernel.stopAll();
});

test('failed provider rebinding restores exact selection and previously active consumers', async () => {
  const f = await fixture(); f.fail();
  await assert.rejects(f.kernel.rebindProvider('example.consumer', 'api', Value.id, 'example.second'), { code: 'ACTIVATION_FAILED' });
  assert.equal(f.read(), 1); assert.equal(snapshot(f.kernel, 'example.optional').state, 'active');
  assert.equal(snapshot(f.kernel, 'example.consumer').bindings[0].providerId, 'example.first');
  await f.kernel.stopAll();
});

test('invalid provider selection leaves running graph untouched', async () => {
  const f = await fixture(); const activation = snapshot(f.kernel, 'example.consumer').activationId;
  await assert.rejects(f.kernel.rebindProvider('example.consumer', 'api', Value.id, 'example.missing'), { code: 'PROVIDER_MISSING' });
  assert.equal(snapshot(f.kernel, 'example.consumer').activationId, activation); assert.equal(f.read(), 1);
  await f.kernel.stopAll();
});
