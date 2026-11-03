import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { defineApi } from '@lunaris/sdk';
import { host, plugin } from './helpers.mjs';

test('API calls observe native, foreign, and thenable failures once without changing synchronous results', async () => {
  const { kernel } = host();
  const api = defineApi({ id: 'results.api', version: '1.0.0' });
  const reason = { failure: 'original rejection value' };
  const value = { answer: 42, then: 'ordinary data' };
  const getterError = new Error('then accessor failed');
  let handle;
  kernel.register(plugin('results.provider', ctx => {
    ctx.provide(api, {
      sync() { return value; },
      primitive() { return 42; },
      empty() { return null; },
      missing() {},
      fail() { throw reason; },
      native(ok) { return ok ? Promise.resolve(value) : Promise.reject(reason); },
      foreign(ok) { return runInNewContext('ok ? Promise.resolve(value) : Promise.reject(reason)', { ok, value, reason }); },
      thenable(ok) { return { then(resolve, reject) { if (ok) resolve(value); else reject(reason); } }; },
      brokenThenable() { return { get then() { throw getterError; } }; },
    });
  }, { provides: [{ kind: 'api', id: api.id, version: api.version }] }));
  kernel.register(plugin('results.consumer', ctx => { handle = ctx.use(api); }, {
    requires: [{ kind: 'api', id: api.id, range: '^1.0.0' }],
  }));
  await kernel.start('results.consumer');
  try {
    assert.equal(handle.sync(), value);
    assert.equal(handle.primitive(), 42);
    assert.equal(handle.empty(), null);
    assert.equal(handle.missing(), undefined);
    assert.throws(() => handle.fail(), error => error === reason);
    for (const kind of ['native', 'foreign', 'thenable']) {
      assert.equal(await handle[kind](true), value);
      await assert.rejects(handle[kind](false), error => error === reason);
    }
    assert.throws(() => handle.brokenThenable(), error => error === getterError);
    const failures = kernel.inspect().diagnostics.filter(item => item.code === 'API_CALL_FAILED');
    assert.equal(failures.length, 5);
    for (const [index, failure] of failures.entries()) {
      assert.equal(failure.pluginId, 'results.consumer');
      assert.equal(failure.contractId, api.id);
      assert.equal(kernel.diagnosticCause(failure.sequence).cause, index === 4 ? getterError : reason);
    }
  } finally {
    await kernel.stopAll();
  }
});
