import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { createKernel } from '@lunaris/kernel';
import { defineApi, definePlugin } from '@lunaris/sdk';

// Independent review probes. Build first: npm run build.
// Exit 1 means at least one expected runtime invariant is still violated.
const scheduler = {
  schedule(delayMs, callback) {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  },
};
const definition = (id, activate, extra = {}) => definePlugin({
  manifest: {
    manifestVersion: 1, id, version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0',
    entry: './plugin.js', provides: [], requires: [], permissions: [], optionalPermissions: [], ...extra,
  }, activate,
});
const api = defineApi({ id: 'audit.contract', version: '1.0.0' });
const provides = [{ kind: 'api', id: api.id, version: api.version }];
const requires = [{ kind: 'api', id: api.id, range: '^1.0.0' }];
const results = [];

async function check(id, probe) {
  const kernel = createKernel({ scheduler });
  try {
    await probe(kernel);
    results.push({ id, passed: true });
  } catch (error) {
    if (!(error instanceof assert.AssertionError)) throw error;
    results.push({ id, passed: false, message: error.message.split('\n')[0] });
  } finally {
    await kernel.stopAll();
  }
}

await check('R1', async kernel => {
  let context;
  let starts = 0;
  kernel.register(definition('audit.self', ctx => { context = ctx; starts++; }));
  await kernel.start('audit.self');
  await context.scope.dispose();
  await kernel.start('audit.self');
  assert.ok(starts === 2 && !context.signal.aborted,
    `start resolved without a live activation: starts=${starts}, state=${kernel.inspect().plugins[0].state}, aborted=${context.signal.aborted}`);
});

await check('R2', async kernel => {
  let provider;
  const entered = Promise.withResolvers();
  const finish = Promise.withResolvers();
  const order = [];
  kernel.register(definition('audit.provider', ctx => {
    provider = ctx;
    ctx.provide(api, {});
    return { dispose() { order.push('provider'); } };
  }, { provides }));
  kernel.register(definition('audit.consumer', () => ({
    async dispose() {
      entered.resolve();
      await finish.promise;
      order.push('consumer');
    },
  }), { requires }));
  await kernel.start('audit.consumer');
  try {
    const disposal = provider.scope.dispose();
    await entered.promise;
    assert.ok(!order.includes('provider'), 'provider resources were disposed while required consumer cleanup was still pending');
    finish.resolve();
    await disposal;
    assert.deepEqual(order, ['consumer', 'provider']);
  } finally {
    finish.resolve();
  }
});

await check('R3', async kernel => {
  const newer = defineApi({ id: api.id, version: '1.2.0' });
  let consumer;
  kernel.register(definition('audit.provider', ctx => {
    ctx.provide(api, { original() { return 1; } });
  }, { provides }));
  kernel.register(definition('audit.consumer', ctx => { consumer = ctx; }, { requires }));
  await kernel.start('audit.consumer');
  assert.equal(consumer.use(api).original(), 1);
  assert.throws(() => consumer.use(newer), { code: 'CONTRACT_METADATA_CONFLICT' },
    'API acquisition must reject a provider older than the requested token');
});

await check('R4', async kernel => {
  let handle;
  kernel.register(definition('audit.provider', ctx => {
    ctx.provide(api, {
      native() { return Promise.reject('native-rejection'); },
      foreign() { return runInNewContext('Promise.reject("foreign-rejection")'); },
    });
  }, { provides }));
  kernel.register(definition('audit.consumer', ctx => { handle = ctx.use(api); }, { requires }));
  await kernel.start('audit.consumer');
  await assert.rejects(handle.native(), error => error === 'native-rejection');
  await assert.rejects(handle.foreign(), error => error === 'foreign-rejection');
  const failures = kernel.inspect().diagnostics.filter(item => item.code === 'API_CALL_FAILED');
  assert.equal(failures.length, 2, 'both native and foreign Promise rejections must produce API_CALL_FAILED');
});

for (const result of results) {
  console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.id}${result.message ? `: ${result.message}` : ''}`);
}
const failed = results.filter(result => !result.passed).length;
console.log(`Core audit: ${results.length} invariants checked; ${failed} violated; ${results.length - failed} passed.`);
process.exitCode = failed ? 1 : 0;
