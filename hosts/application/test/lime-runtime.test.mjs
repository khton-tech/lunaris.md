import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestKernel } from '@lunaris/test';
import { definePlugin } from '@lunaris/sdk';
import { Logger } from '@lunaris/logging';
import execution from '@lunaris/quickjs-execution';
import { LimeRuntime } from '@lunaris/lime';
import { createLimeRuntime } from '../dist/lime-runtime.js';

async function fixture() {
  const kernel = createTestKernel(); let runtime;
  const loggerId = kernel.installMock(Logger, { log() { return true; }, debug() { return true; }, info() { return true; }, warn() { return true; }, error() { return true; } });
  kernel.register(execution); kernel.register(createLimeRuntime(kernel, [loggerId, execution.manifest.id, 'test.manager', 'test.builtin']));
  kernel.grant('lunaris.lime-runtime-adapter', 'runtime.manage');
  kernel.register(definePlugin({ manifest: { manifestVersion: 1, id: 'test.manager', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides: [], requires: [{ kind: 'api', id: LimeRuntime.id, range: '^1.0.0' }], permissions: ['runtime.manage'], optionalPermissions: [] }, activate(ctx) { runtime = ctx.use(LimeRuntime); } }));
  kernel.grant('test.manager', 'runtime.manage'); await kernel.start('test.manager');
  return { kernel, runtime };
}
const manifest = (version = '1.0.0', id = 'test.package') => ({ manifestVersion: 1, id, version, engine: '^0.1.0', sdk: '^0.1.0', entry: './plugin.js', provides: [], requires: [], permissions: [], optionalPermissions: [] });
const source = (data, body = '') => ({ entry: 'plugin.js', modules: { 'plugin.js': `export default { manifest: ${JSON.stringify(data)}, activate(ctx) { ctx.scope.own({ dispose() {} }); ${body} } };` } });

test('public runtime adapter manages actual isolated plugins and reports code rollback', async () => {
  const { kernel, runtime } = await fixture(); const env = { vaultId: 'a', generation: 1 };
  assert.equal((await runtime.open(env)).ok, true);
  assert.equal((await runtime.register(env, manifest(), source(manifest()), true)).ok, true);
  assert.deepEqual(runtime.snapshot(env).value, [{ id: 'test.package', version: '1.0.0', state: 'active' }]);
  assert.equal(kernel.inspect().plugins.find(item => item.manifest.id === 'test.package').ownerId, 'lunaris.lime-runtime-adapter');
  assert.equal((await runtime.disable(env, 'test.package')).ok, true); assert.equal(runtime.snapshot(env).value[0].state, 'stopped');
  assert.equal((await runtime.enable(env, 'test.package')).ok, true);
  assert.equal((await runtime.replace(env, manifest('2.0.0'), source(manifest('2.0.0')))).ok, true);
  assert.equal((await runtime.replace(env, manifest('3.0.0'), source(manifest('3.0.0'), 'throw Error("failed update");'))).error.code, 'RUNTIME_FAILED');
  assert.deepEqual(runtime.snapshot(env).value, [{ id: 'test.package', version: '2.0.0', state: 'active' }]);
  assert.equal((await runtime.remove(env, 'test.package')).ok, true); assert.deepEqual(runtime.snapshot(env).value, []);
  await kernel.stopAll(); kernel.assertNoResources();
});

test('runtime refuses builtin collisions and stale cross-Vault operations', async () => {
  const { kernel, runtime } = await fixture(); const a = { vaultId: 'a', generation: 1 }; const b = { vaultId: 'b', generation: 2 };
  await runtime.open(a);
  assert.equal((await runtime.register(a, manifest('1.0.0', 'test.builtin'), source(manifest('1.0.0', 'test.builtin')), false)).error.code, 'CONFLICT');
  await runtime.register(a, manifest(), source(manifest()), true);
  assert.equal((await runtime.open(b)).ok, true); assert.deepEqual(runtime.snapshot(b).value, []);
  assert.equal((await runtime.enable(a, 'test.package')).error.code, 'STALE');
  assert.equal((await runtime.register(b, manifest('2.0.0'), source(manifest('2.0.0')), true)).ok, true);
  assert.equal((await runtime.open(a)).error.code, 'STALE');
  await kernel.stopAll(); kernel.assertNoResources();
});

test('host shutdown cleans managed guest scopes before runtime/driver cancellation', async () => {
  const { kernel, runtime } = await fixture(); const env = { vaultId: 'a', generation: 1 };
  await runtime.open(env); await runtime.register(env, manifest(), source(manifest()), true);
  await kernel.stopAll(); kernel.assertNoResources();
  assert.equal(kernel.diagnostics().some(item => item.code === 'CLEANUP_FAILED'), false);
});
