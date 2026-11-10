import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createTestKernel } from '@lunaris/test';
import { definePlugin } from '@lunaris/sdk';
import { Logger } from '@lunaris/logging';
import { Vault } from '@lunaris/vault';
import execution from '@lunaris/quickjs-execution';
import { LimeRuntime } from '@lunaris/lime';
import { createLimeRuntime } from '../dist/lime-runtime.js';

async function fixture() {
  const kernel = createTestKernel(); let runtime;
  const loggerId = kernel.installMock(Logger, { log() { return true; }, debug() { return true; }, info() { return true; }, warn() { return true; }, error() { return true; } });
  kernel.installMock(Vault, { current() { return null; }, async open() { return { ok: true, value: null }; }, async close() { return { ok: true, value: null }; } });
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
  assert.equal((await runtime.disable(env, 'test.package')).ok, true); assert.equal(runtime.snapshot(env).value[0].state, 'disabled');
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

test('disabled package providers never auto-start through another package requirement', async () => {
  const { kernel, runtime } = await fixture(); const env = { vaultId: 'a', generation: 1 }; await runtime.open(env);
  const provider = { ...manifest('1.0.0', 'test.provider'), provides: [{ kind: 'api', id: 'test.value', version: '1.0.0' }] };
  const consumer = { ...manifest('1.0.0', 'test.consumer'), requires: [{ kind: 'api', id: 'test.value', range: '^1.0.0' }] };
  await runtime.register(env, provider, source(provider, "ctx.provide({kind:'api',id:'test.value',version:'1.0.0'}, {read(){return 1}});"), false);
  assert.equal((await runtime.register(env, consumer, source(consumer), true)).error.code, 'RUNTIME_FAILED');
  assert.equal(runtime.snapshot(env).value.find(item => item.id === 'test.provider').state, 'disabled');
  assert.equal((await runtime.enable(env, 'test.provider')).ok, true); assert.equal((await runtime.enable(env, 'test.consumer')).ok, true);
  assert.equal((await runtime.disable(env, 'test.provider')).ok, true);
  assert.equal((await runtime.enable(env, 'test.consumer')).error.code, 'RUNTIME_FAILED');
  assert.equal(runtime.snapshot(env).value.find(item => item.id === 'test.provider').state, 'disabled');
  await kernel.stopAll(); kernel.assertNoResources();
});

test('runtime update grants new declared permissions before candidate code runs', async () => {
  const { kernel, runtime } = await fixture(); const env = { vaultId: 'a', generation: 1 }; await runtime.open(env);
  await runtime.register(env, manifest(), source(manifest()), true);
  const candidate = { ...manifest('2.0.0'), permissions: ['example.new'] };
  const updated = await runtime.replace(env, candidate, source(candidate, "if (!ctx.permissions.has('example.new')) throw Error('missing automatic grant');"));
  assert.equal(updated.ok, true); assert.equal(runtime.snapshot(env).value[0].version, '2.0.0'); await kernel.stopAll();
});

test('actual bundled SDK and Logger execute a metadata-bearing author plugin without host Intl', async () => {
  const { kernel, runtime } = await fixture(); const env = { vaultId: 'a', generation: 1 }; await runtime.open(env);
  const data = { ...manifest(), metadata: { name: 'Author plugin', author: 'Author', description: 'Bundled SDK', platforms: 'universal', languages: ['en', 'ru'] }, requires: [{ kind: 'api', id: Logger.id, range: '^1.0.0' }] };
  const output = await build({ stdin: { contents: `import { definePlugin } from '@lunaris/sdk'; import { Logger } from '@lunaris/logging'; export default definePlugin({manifest:${JSON.stringify(data)},activate(ctx){ctx.use(Logger).info(ctx.pluginId,'Author plugin ready');ctx.scope.own({dispose(){}});}});`, resolveDir: process.cwd(), sourcefile: 'author-plugin.js' }, bundle: true, platform: 'neutral', format: 'esm', write: false, logLevel: 'silent' });
  const result = await runtime.register(env, data, { entry: 'plugin.js', modules: { 'plugin.js': output.outputFiles[0].text } }, true);
  assert.equal(result.ok, true, JSON.stringify(kernel.inspect().diagnostics));
  assert.equal(runtime.snapshot(env).value[0].state, 'active'); await kernel.stopAll(); kernel.assertNoResources();
});
