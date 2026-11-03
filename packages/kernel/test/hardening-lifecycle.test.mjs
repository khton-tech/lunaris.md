import test from 'node:test';
import assert from 'node:assert/strict';
import { defineApi } from '@lunaris/sdk';
import { host, plugin, deferred } from './helpers.mjs';

const permutations = values => values.length ? values.flatMap((value, i) =>
  permutations(values.filter((_, j) => i !== j)).map(rest => [value, ...rest])) : [[]];

for (const kind of ['api', 'event', 'hook']) for (const shape of ['pair', 'diamond']) {
  for (const actions of [
    ['stop-consumer', 'stop-provider', 'start-consumer'],
    ['stop-provider', 'start-consumer', 'stop-all'],
    ['restart-consumer', 'stop-provider', 'start-consumer'],
  ]) for (const ordering of permutations(actions)) {
    test(`${kind} ${shape}: ${ordering.join(', ')}`, { timeout: 2000 }, async () => {
      const { kernel, clock } = host(); let resources = 0;
      const graph = shape === 'pair' ? [['provider', []], ['consumer', ['provider']]] :
        [['provider', []], ['left', ['provider']], ['right', ['provider']], ['consumer', ['left', 'right']]];
      for (const [name, deps] of graph) {
        const id = `hardening.${name}`;
        const token = defineApi({ id, version: '1.0.0' });
        kernel.register(plugin(id, ctx => {
          resources++;
          if (kind === 'api') ctx.provide(token, {});
          return { dispose() { resources--; } };
        }, { provides: [{ kind, id, version: '1.0.0' }],
          requires: deps.map(dep => ({ kind, id: `hardening.${dep}`, range: '^1.0.0' })) }));
      }
      await kernel.start('hardening.consumer');
      const results = await Promise.allSettled(ordering.map(action => {
        if (action === 'stop-all') return kernel.stopAll();
        const [method, name] = action.split('-'); return kernel[method](`hardening.${name}`);
      }));
      for (const result of results) if (result.status === 'rejected') {
        assert.ok(result.reason.code === 'PROVIDER_UNAVAILABLE' ||
          (result.reason.code === 'ACTIVATION_FAILED' && result.reason.cause?.code === 'PROVIDER_UNAVAILABLE'), String(result.reason));
      }
      const snapshots = kernel.inspect().plugins;
      for (const consumer of snapshots.filter(p => p.state === 'active')) for (const binding of consumer.bindings) {
        const provider = snapshots.find(p => p.manifest.id === binding.providerId);
        assert.equal(provider?.state, 'active'); assert.equal(provider.activationId, binding.activationId);
      }
      await kernel.stopAll();
      assert.equal(resources, 0); assert.equal(clock.tasks.size, 0);
      assert.ok(kernel.inspect().plugins.every(p => p.ownedResources === 0 && p.state === 'stopped'));
    });
  }
}

test('provider stop reserves a consumer whose activation is still pending', { timeout: 2000 }, async () => {
  const { kernel } = host(); const entered = deferred(), finish = deferred();
  const token = defineApi({ id: 'hardening.api', version: '1.0.0' });
  kernel.register(plugin('hardening.provider', async ctx => {
    entered.resolve(); await finish.promise; ctx.provide(token, {});
  }, { provides: [{ kind: 'api', id: token.id, version: token.version }] }));
  kernel.register(plugin('hardening.consumer', () => {}, { requires: [{ kind: 'api', id: token.id, range: '^1.0.0' }] }));
  const starting = kernel.start('hardening.consumer'); await entered.promise;
  const stopped = kernel.stop('hardening.provider');
  const results = Promise.allSettled([starting, stopped]); finish.resolve();
  await results;
  assert.equal(kernel.inspect().plugins.find(p => p.manifest.id === 'hardening.consumer').state, 'stopped');
  assert.equal(kernel.inspect().plugins.find(p => p.manifest.id === 'hardening.provider').state, 'stopped');
});

test('dependent deadline drains cleanup and releases both shutdown queues', { timeout: 2000 }, async () => {
  const { kernel, clock } = host(); const entered = deferred(); let providerDisposed = false;
  const token = defineApi({ id: 'hardening.api', version: '1.0.0' });
  kernel.register(plugin('hardening.provider', ctx => {
    ctx.provide(token, {}); return { dispose() { providerDisposed = true; } };
  }, { provides: [{ kind: 'api', id: token.id, version: token.version }] }));
  kernel.register(plugin('hardening.consumer', () => ({ dispose() { entered.resolve(); return new Promise(() => {}); } }),
    { requires: [{ kind: 'api', id: token.id, range: '^1.0.0' }] }));
  await kernel.start('hardening.consumer');
  const stopped = assert.rejects(kernel.stop('hardening.provider'), { code: 'CLEANUP_FAILED' });
  await entered.promise; clock.fire(); await stopped;
  assert.equal(providerDisposed, true); assert.equal(clock.tasks.size, 0);
});
