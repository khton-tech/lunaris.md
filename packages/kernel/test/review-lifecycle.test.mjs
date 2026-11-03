import test from 'node:test';
import assert from 'node:assert/strict';
import { defineApi } from '@lunaris/sdk';
import { deferred, host, plugin, snapshot } from './helpers.mjs';
const api = defineApi({ id: 'review.api', version: '1.0.0' });
const provides = [{ kind: 'api', id: api.id, version: api.version }];
const requires = [{ kind: 'api', id: api.id, range: '^1.0.0' }];

for (const action of ['stop', 'stopAll', 'restart']) {
  test(`dependency-blocked start is ordered before ${action}`, async () => {
    const { kernel } = host(); const entered = deferred(), finish = deferred(); let starts = 0, disposals = 0;
    kernel.register(plugin('review.provider', async ctx => { entered.resolve(); await finish.promise; ctx.provide(api, {}); }, { provides }));
    kernel.register(plugin('review.consumer', () => { starts++; return { dispose() { disposals++; } }; }, { requires }));
    const starting = kernel.start('review.consumer'); await entered.promise;
    const later = action === 'stopAll' ? kernel.stopAll() : kernel[action]('review.consumer');
    finish.resolve(); await starting; await later;
    assert.equal(snapshot(kernel, 'review.consumer').state, action === 'restart' ? 'active' : 'stopped');
    assert.equal(starts, action === 'restart' ? 2 : 1); assert.equal(disposals, 1);
    await kernel.stopAll(); assert.equal(snapshot(kernel, 'review.consumer').ownedResources, 0);
  });
}

test('selection cannot change while root start awaits a dependency', async () => {
  const { kernel } = host(); const entered = deferred(), finish = deferred();
  kernel.register(plugin('review.first', async ctx => { entered.resolve(); await finish.promise; ctx.provide(api, {}); }, { provides }));
  kernel.register(plugin('review.second', ctx => { ctx.provide(api, {}); }, { provides }));
  kernel.register(plugin('review.consumer', () => {}, { requires }));
  kernel.selectProvider('review.consumer', 'api', api.id, 'review.first');
  const starting = kernel.start('review.consumer'); await entered.promise;
  assert.throws(() => kernel.selectProvider('review.consumer', 'api', api.id, 'review.second'), { code: 'LIFECYCLE_INVALID' });
  finish.resolve(); await starting;
  assert.equal(snapshot(kernel, 'review.consumer').bindings[0].providerId, 'review.first');
  await kernel.stopAll();
});

for (const kind of ['api', 'event', 'hook']) {
  test(`provider shutdown rejects a late required ${kind} consumer during dependent drain`, async () => {
    const { kernel } = host(); const entered = deferred(), finish = deferred(), qEntered = deferred(), qFinish = deferred();
    const provided = [{ kind, id: api.id, version: api.version }];
    const required = [{ kind, id: api.id, range: '^1.0.0' }];
    kernel.register(plugin('review.provider', ctx => { if (kind === 'api') ctx.provide(api, {}); }, { provides: provided }));
    kernel.register(plugin('review.existing', () => ({ async dispose() { entered.resolve(); await finish.promise; } }), { requires: required }));
    const q = defineApi({ id: 'review.second', version: '1.0.0' });
    kernel.register(plugin('review.zdependency', async ctx => { qEntered.resolve(); await qFinish.promise; ctx.provide(q, {}); }, { provides: [{ kind: 'api', id: q.id, version: q.version }] }));
    kernel.register(plugin('review.new', () => {}, { requires: [...required, { kind: 'api', id: q.id, range: '^1.0.0' }] }));
    await kernel.start('review.existing');
    const starting = kernel.start('review.new'); const rejected = assert.rejects(starting, { code: 'PROVIDER_UNAVAILABLE' }); await qEntered.promise;
    const stopping = kernel.stop('review.provider'); await entered.promise;
    assert.equal(snapshot(kernel, 'review.provider').state, 'stopping');
    qFinish.resolve(); await rejected; finish.resolve(); await stopping;
    assert.notEqual(snapshot(kernel, 'review.new').state, 'active'); await kernel.stopAll();
  });
}

test('idempotent start does not revive a stopped optional dependency; restart refreshes binding', async () => {
  const { kernel } = host(); let starts = 0;
  kernel.register(plugin('review.provider', ctx => { starts++; ctx.provide(api, {}); }, { provides }));
  kernel.register(plugin('review.consumer', () => {}, { requires: requires.map(r => ({ ...r, optional: true })) }));
  await kernel.start('review.consumer'); const old = snapshot(kernel, 'review.consumer');
  await kernel.stop('review.provider'); await kernel.start('review.consumer');
  assert.equal(starts, 1); assert.equal(snapshot(kernel, 'review.provider').state, 'stopped');
  assert.equal(snapshot(kernel, 'review.consumer').activationId, old.activationId);
  await kernel.restart('review.consumer'); assert.equal(starts, 2);
  assert.equal(snapshot(kernel, 'review.consumer').bindings[0].activationId, snapshot(kernel, 'review.provider').activationId);
  await kernel.stopAll();
});

test('start queued behind stop resolves fresh dependencies instead of the former active binding', async () => {
  const { kernel } = host();
  kernel.register(plugin('review.provider', ctx => { ctx.provide(api, {}); }, { provides }));
  kernel.register(plugin('review.consumer', () => {}, { requires }));
  await kernel.start('review.consumer');
  const old = snapshot(kernel, 'review.consumer').activationId;
  const stopping = kernel.stop('review.consumer'); const starting = kernel.start('review.consumer');
  await stopping; await starting;
  assert.equal(snapshot(kernel, 'review.consumer').state, 'active');
  assert.notEqual(snapshot(kernel, 'review.consumer').activationId, old);
  await kernel.stopAll();
});

test('concurrent idempotent starts leave a lost optional provider stopped', async () => {
  const { kernel } = host(); let starts = 0;
  kernel.register(plugin('review.provider', ctx => { starts++; ctx.provide(api, {}); }, { provides }));
  kernel.register(plugin('review.consumer', () => {}, { requires: requires.map(r => ({ ...r, optional: true })) }));
  await kernel.start('review.consumer'); await kernel.stop('review.provider');
  await Promise.all([kernel.start('review.consumer'), kernel.start('review.consumer')]);
  assert.equal(starts, 1); await kernel.stopAll();
});
