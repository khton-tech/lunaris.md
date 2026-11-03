// Reproduce review findings through public package exports; no production fixes.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createKernel } from '@lunaris/kernel';
import { defineApi, defineEvent, definePlugin } from '@lunaris/sdk';

const results = [];
const deferred = () => Promise.withResolvers();
const scheduler = { schedule(ms, callback) { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); } };
const host = () => createKernel({ scheduler, activationTimeoutMs: 1000, stopTimeoutMs: 1000 });
const api = defineApi({ id: 'review.api', version: '1.0.0' });
const provides = [{ kind: 'api', id: api.id, version: api.version }];
const requires = [{ kind: 'api', id: api.id, range: '^1.0.0' }];
const plugin = (id, activate = () => {}, extra = {}) => definePlugin({ manifest: {
  manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './plugin.js',
  provides: [], requires: [], permissions: [], optionalPermissions: [], ...extra,
}, activate });
const state = (kernel, id) => kernel.inspect().plugins.find(p => p.manifest.id === id).state;
async function scenario(id, run) { const evidence = await run(); results.push({ id, evidence }); }

async function main() {
await scenario('R01', async () => {
  const kernel = host(); const entered = deferred(); const finish = deferred();
  kernel.register(plugin('review.provider', async ctx => { entered.resolve(); await finish.promise; ctx.provide(api, {}); }, { provides }));
  kernel.register(plugin('review.consumer', () => {}, { requires }));
  const starting = kernel.start('review.consumer'); await entered.promise;
  await kernel.stop('review.consumer'); finish.resolve(); await starting;
  const observed = state(kernel, 'review.consumer'); assert.equal(observed, 'active');
  await kernel.stopAll(); return { stateAfterLaterStop: observed };
});

await scenario('R02', async () => {
  const kernel = host(); const entered = deferred(); const finish = deferred(); const dependencyEntered = deferred(); const dependencyFinish = deferred();
  const second = defineApi({ id: 'review.second', version: '1.0.0' });
  kernel.register(plugin('review.provider', ctx => { ctx.provide(api, {}); }, { provides }));
  kernel.register(plugin('review.existing', () => ({ async dispose() { entered.resolve(); await finish.promise; } }), { requires }));
  kernel.register(plugin('review.zdependency', async ctx => { dependencyEntered.resolve(); await dependencyFinish.promise; ctx.provide(second, {}); }, { provides: [{ kind: 'api', id: second.id, version: second.version }] }));
  kernel.register(plugin('review.new', () => {}, { requires: [...requires, { kind: 'api', id: second.id, range: '^1.0.0' }] }));
  await kernel.start('review.existing');
  const starting = kernel.start('review.new'); await dependencyEntered.promise;
  const stopping = kernel.stop('review.provider'); await entered.promise;
  dependencyFinish.resolve(); await starting; finish.resolve(); await stopping;
  const observed = state(kernel, 'review.new'); assert.equal(observed, 'active');
  assert.equal(state(kernel, 'review.provider'), 'stopped'); await kernel.stopAll();
  return { requiredConsumer: observed, provider: 'stopped' };
});

await scenario('R03', async () => {
  const kernel = host(); const protectedApi = defineApi({ id: api.id, version: api.version, consumePermission: 'review.read' });
  let leaked; let handle; let calls = 0;
  const consumerApi = defineApi({ id: api.id, version: api.version, consumePermission: 'review.read', validate(value) { leaked = value; return true; } });
  kernel.register(plugin('review.provider', ctx => { ctx.provide(protectedApi, { read() { return ++calls; } }); }, { provides }));
  kernel.register(plugin('review.consumer', ctx => { handle = ctx.use(consumerApi); }, { requires, permissions: ['review.read'] }));
  kernel.grant('review.consumer', 'review.read'); await kernel.start('review.consumer');
  kernel.revoke('review.consumer', 'review.read'); assert.throws(() => handle.read(), { code: 'PERMISSION_DENIED' });
  assert.equal(leaked.read(), 1); await kernel.stopAll(); assert.equal(leaked.read(), 2);
  return { rawCallsAfterRevokeAndStop: calls };
});

await scenario('R04', async () => {
  const kernel = host(); const entered = deferred(); const finish = deferred(); let a = 0; let b = 0;
  kernel.register(plugin('review.first', async ctx => { entered.resolve(); await finish.promise; a++; ctx.provide(api, {}); }, { provides }));
  kernel.register(plugin('review.second', ctx => { b++; ctx.provide(api, {}); }, { provides }));
  kernel.register(plugin('review.consumer', () => {}, { requires }));
  kernel.selectProvider('review.consumer', 'api', api.id, 'review.first');
  const starting = kernel.start('review.consumer'); await entered.promise;
  kernel.selectProvider('review.consumer', 'api', api.id, 'review.second');
  finish.resolve(); await starting;
  const binding = kernel.inspect().plugins.find(p => p.manifest.id === 'review.consumer').bindings[0].providerId;
  assert.equal(binding, 'review.first'); await kernel.stopAll(); return { selected: 'review.second', bound: binding, activations: [a, b] };
});

await scenario('R05', async () => {
  const kernel = host(); let starts = 0;
  kernel.register(plugin('review.provider', ctx => { starts++; ctx.provide(api, {}); }, { provides }));
  kernel.register(plugin('review.consumer', () => {}, { requires: requires.map(r => ({ ...r, optional: true })) }));
  await kernel.start('review.consumer'); await kernel.stop('review.provider');
  await kernel.start('review.consumer'); assert.equal(starts, 2);
  const consumer = kernel.inspect().plugins.find(p => p.manifest.id === 'review.consumer');
  const provider = kernel.inspect().plugins.find(p => p.manifest.id === 'review.provider');
  assert.notEqual(consumer.bindings[0].activationId, provider.activationId);
  await kernel.stopAll(); return { providerStarts: starts, boundActivation: consumer.bindings[0].activationId, actualActivation: provider.activationId };
});

// Measure the actual hot path while keeping the caller/contract unchanged.
for (const unrelated of [0, 100, 1000]) {
  const kernel = host(); let handle;
  kernel.register(plugin('review.provider', ctx => { ctx.provide(api, { ping() { return 1; } }); }, { provides }));
  kernel.register(plugin('review.consumer', ctx => { handle = ctx.use(api); }, { requires }));
  for (let index = 0; index < unrelated; index++) kernel.register(plugin(`review.extra-${index}`));
  await kernel.start('review.consumer');
  for (let index = 0; index < 1000; index++) handle.ping();
  const began = performance.now();
  for (let index = 0; index < 10000; index++) handle.ping();
  results.push({ id: 'R06', unrelated, calls: 10000, elapsedMs: +(performance.now() - began).toFixed(2) });
  await kernel.stopAll();
}

for (const pairs of [100, 500, 1000]) {
  const kernel = host(); kernel.register(plugin('review.target'));
  for (let index = 0; index < pairs; index++) {
    const token = defineApi({ id: `review.contract-${index}`, version: '1.0.0' });
    kernel.register(plugin(`review.provider-${index}`, ctx => { ctx.provide(token, {}); }, { provides: [{ kind: 'api', id: token.id, version: token.version }] }));
    kernel.register(plugin(`review.consumer-${index}`, () => {}, { requires: [{ kind: 'api', id: token.id, range: '^1.0.0' }] }));
  }
  const began = performance.now(); await kernel.start('review.target');
  results.push({ id: 'R07', unrelatedPairs: pairs, isolatedStartMs: +(performance.now() - began).toFixed(2) });
  await kernel.stopAll();
}

await scenario('R08', async () => {
  const kernel = host(); let owner;
  const event = defineEvent({ id: 'review.event', version: '1.0.0' });
  kernel.register(plugin('review.provider', ctx => { owner = ctx; }, { provides: [{ kind: 'event', id: event.id, version: event.version }] }));
  kernel.register(plugin('review.consumer', ctx => { ctx.events.on(event, () => { throw new Error('Fixture failure detail'); }); }, { requires: [{ kind: 'event', id: event.id, range: '^1.0.0' }] }));
  await kernel.start('review.consumer'); await owner.events.emit(event, null);
  const diagnostic = kernel.inspect().diagnostics.find(d => d.code === 'EVENT_LISTENER_FAILED');
  assert.deepEqual(diagnostic.cause, { kind: 'object' });
  await kernel.stopAll(); return { emissionResolved: true, exposedCause: diagnostic.cause };
});
console.log(JSON.stringify({ node: process.version, results }, null, 2));
}

main().catch(error => {
  console.error(`Core review reproduction failed: ${error.message}`);
  process.exitCode = 1;
});
