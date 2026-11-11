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

test('prospective package plan follows disabled and transitive providers without registering or running them', async () => {
  const { kernel, runtime } = await fixture();
  const env = { vaultId: 'a', generation: 1 };
  await runtime.open(env);
  const provider = { ...manifest('1.0.0', 'test.provider'),
    provides: [{ kind: 'api', id: 'test.service', version: '1.1.0' }],
    requires: [{ kind: 'api', id: 'test.missing', range: '^2.0.0' }] };
  await runtime.register(env, provider, source(provider, 'throw Error("must remain disabled");'), false);
  const candidate = { ...manifest(), requires: [{ kind: 'api', id: 'test.service', range: '^1.0.0' }] };
  const before = kernel.inspect();
  const plan = runtime.plan(env, candidate.id, candidate).value;
  assert.deepEqual(plan.graph.map(node => node.pluginId), [candidate.id, provider.id]);
  assert.deepEqual(plan.dependencies[0].candidates, [{ id: provider.id, version: '1.1.0', state: 'disabled' }]);
  assert.deepEqual(plan.graph[1].dependencies[0].candidates, []);
  assert.deepEqual(kernel.inspect(), before);
  await kernel.stopAll();
});

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
  const candidate = { ...manifest('2.0.0'), permissions: ['example.new'], optionalPermissions: ['example.optional'] };
  const updated = await runtime.replace(env, candidate, source(candidate, "if (!ctx.permissions.has('example.new') || !ctx.permissions.has('example.optional')) throw Error('missing automatic grant');"));
  assert.equal(updated.ok, true); assert.equal(runtime.snapshot(env).value[0].version, '2.0.0'); await kernel.stopAll();
});

test('initial activation automatically grants declared optional permissions without a prompt', async () => {
  const { kernel, runtime } = await fixture(); const env = { vaultId: 'a', generation: 1 }; await runtime.open(env);
  const data = { ...manifest(), optionalPermissions: ['example.optional'] };
  assert.equal((await runtime.register(env, data, source(data, "if (!ctx.permissions.has('example.optional')) throw Error('missing optional grant');"), true)).ok, true);
  assert.deepEqual(kernel.inspect().plugins.find(item => item.manifest.id === data.id).effectivePermissions, ['example.optional']);
  await kernel.stopAll();
});

test('actual bundled SDK and Logger execute a metadata-bearing author plugin without host Intl', async () => {
  const { kernel, runtime } = await fixture(); const env = { vaultId: 'a', generation: 1 }; await runtime.open(env);
  const data = { ...manifest(), metadata: { name: 'Author plugin', author: 'Author', description: 'Bundled SDK', platforms: 'universal', languages: ['en', 'ru'] }, requires: [{ kind: 'api', id: Logger.id, range: '^1.0.0' }] };
  const output = await build({ stdin: { contents: `import { definePlugin } from '@lunaris/sdk'; import { Logger } from '@lunaris/logging'; export default definePlugin({manifest:${JSON.stringify(data)},activate(ctx){ctx.use(Logger).info(ctx.pluginId,'Author plugin ready');ctx.scope.own({dispose(){}});}});`, resolveDir: process.cwd(), sourcefile: 'author-plugin.js' }, bundle: true, platform: 'neutral', format: 'esm', write: false, logLevel: 'silent' });
  const result = await runtime.register(env, data, { entry: 'plugin.js', modules: { 'plugin.js': output.outputFiles[0].text } }, true);
  assert.equal(result.ok, true, JSON.stringify(kernel.inspect().diagnostics));
  assert.equal(runtime.snapshot(env).value[0].state, 'active'); await kernel.stopAll(); kernel.assertNoResources();
});

test('isolated packages read only captured assets, including after update and rollback', async () => {
  const { kernel, runtime } = await fixture(); const env = { vaultId: 'a', generation: 1 }; await runtime.open(env);
  const bytes = [...new TextEncoder().encode('Привет')];
  const data = manifest();
  const packageSource = { ...source(data, `if(ctx.resources.text('assets/message')!=='Привет') throw Error('missing resource'); if(ctx.resources.read('assets/message',0,2).length!==2) throw Error('binary'); let denied=false; try{ctx.resources.read('../outside')}catch{denied=true} if(!denied) throw Error('escaped');`), resources: { 'assets/message': bytes } };
  const loading = runtime.register(env, data, packageSource, true); bytes.fill(0);
  assert.equal((await loading).ok, true);
  const next = manifest('2.0.0');
  assert.equal((await runtime.replace(env, next, { ...source(next, `if(ctx.resources.text('assets/message')!=='new') throw Error('old resource');`), resources: { 'assets/message': [110,101,119] } })).ok, true);
  assert.equal((await runtime.replace(env, manifest('3.0.0'), source(manifest('3.0.0'), 'throw Error("failed");'))).ok, false);
  assert.equal(runtime.snapshot(env).value[0].state, 'active'); assert.equal(runtime.snapshot(env).value[0].version, '2.0.0');
  await runtime.close(env); await kernel.stopAll(); kernel.assertNoResources();
});

test('runtime dependency plans disclose disabled candidates and apply revision-bound provider choices', async () => {
  const { kernel, runtime } = await fixture(); const env = { vaultId: 'a', generation: 1 }; await runtime.open(env);
  for (const id of ['test.first', 'test.second']) {
    const data = { ...manifest('1.0.0', id), provides: [{ kind: 'api', id: 'test.value', version: '1.0.0' }] };
    await runtime.register(env, data, source(data, `ctx.provide({kind:'api',id:'test.value',version:'1.0.0'},{read(){return 1}});`), id === 'test.first');
  }
  const data = { ...manifest('1.0.0', 'test.dependent'), requires: [{ kind: 'api', id: 'test.value', range: '^1.0.0' }] };
  await runtime.register(env, data, source(data, `ctx.use({kind:'api',id:'test.value',version:'1.0.0'}).read();`), false);
  let plan = runtime.plan(env, data.id).value;
  assert.deepEqual(plan.affected, [data.id]); assert.deepEqual(plan.dependencies[0].candidates.map(item => [item.id,item.state]), [['test.first','active'],['test.second','disabled']]);
  assert.throws(() => plan.dependencies[0].candidates.push({}), TypeError);
  assert.equal((await runtime.selectProvider(env, data.id, 'api', 'test.value', 'test.second', plan.revision)).ok, true);
  assert.equal((await runtime.enable(env, data.id)).ok, false); assert.equal(runtime.snapshot(env).value.find(item => item.id === 'test.second').state, 'disabled');
  await runtime.enable(env, 'test.second'); await runtime.enable(env, data.id);
  assert.equal(kernel.inspect().plugins.find(item => item.manifest.id === data.id).bindings.find(item => item.contract === 'api:test.value').providerId, 'test.second');
  plan = runtime.plan(env, data.id).value;
  assert.equal((await runtime.selectProvider(env, data.id, 'api', 'test.value', 'test.first', plan.revision)).ok, true);
  assert.equal(kernel.inspect().plugins.find(item => item.manifest.id === data.id).bindings.find(item => item.contract === 'api:test.value').providerId, 'test.first');
  assert.equal((await runtime.selectProvider(env, data.id, 'api', 'test.value', 'test.second', plan.revision)).error.code, 'STALE');
  await kernel.stopAll(); kernel.assertNoResources();
});

test('dependency plans become stale after host lifecycle changes outside the adapter', async () => {
  const { kernel, runtime } = await fixture(); const env = { vaultId: 'a', generation: 1 }; await runtime.open(env);
  await runtime.register(env, manifest(), source(manifest()), false);
  const plan = runtime.plan(env, 'test.package').value;
  kernel.register(definePlugin({ manifest: manifest('1.0.0','test.unrelated'), activate() {} }));
  assert.equal((await runtime.selectProvider(env, 'test.package', 'api', 'test.value', 'test.provider', plan.revision)).error.code, 'STALE');
  await kernel.stopAll();
});

test('update checkpoint keeps code/resources inactive until explicit resume and restores old code before data recovery', async () => {
  const { kernel, runtime } = await fixture(); const env = { vaultId: 'a', generation: 1 }; await runtime.open(env);
  const original = manifest();
  await runtime.register(env, original, { ...source(original, `if(ctx.resources.text('assets/value')!=='old') throw Error('lost old bytes');`), resources: { 'assets/value': [111,108,100] } }, true);
  const suspended = await runtime.suspend(env, original.id); assert.equal(suspended.ok, true);
  assert.equal(runtime.snapshot(env).value[0].state, 'stopped');
  assert.equal((await runtime.enable(env, original.id)).error.code, 'CONFLICT');
  assert.equal((await runtime.remove(env, original.id)).error.code, 'CONFLICT');
  assert.equal((await runtime.suspend(env, original.id)).error.code, 'CONFLICT');
  const candidate = manifest('2.0.0');
  assert.equal((await runtime.replace(env, candidate, source(candidate, 'throw Error("candidate migration failed");'))).ok, true);
  assert.equal(runtime.snapshot(env).value[0].state, 'registered');
  assert.equal((await runtime.resume(env, suspended.value)).error.code, 'RUNTIME_FAILED');
  assert.equal((await runtime.rollback(env, suspended.value)).ok, true);
  assert.equal(runtime.snapshot(env).value[0].version, '1.0.0'); assert.notEqual(runtime.snapshot(env).value[0].state, 'active');
  // The manager restores its durable managed-data snapshot before this call.
  assert.equal((await runtime.resume(env, suspended.value)).ok, true); assert.equal(runtime.snapshot(env).value[0].state, 'active');
  assert.equal((await runtime.finish(env, suspended.value)).ok, true);
  assert.equal((await runtime.rollback(env, suspended.value)).error.code, 'NOT_FOUND');
  await runtime.close(env); await kernel.stopAll(); kernel.assertNoResources();
});

test('checkpoint closure revokes suspended generations and leaves disabled updates unevaluated', async () => {
  const { kernel, runtime } = await fixture(); const env = { vaultId: 'a', generation: 1 }; await runtime.open(env);
  await runtime.register(env, manifest(), source(manifest()), false);
  const checkpoint = (await runtime.suspend(env, 'test.package')).value;
  const candidate = manifest('2.0.0'); await runtime.replace(env, candidate, source(candidate, 'throw Error("disabled code evaluated");'));
  assert.equal((await runtime.resume(env, checkpoint)).ok, true); assert.equal(runtime.snapshot(env).value[0].state, 'disabled');
  await runtime.close(env); await runtime.open({ vaultId: 'b', generation: 2 });
  assert.equal((await runtime.resume(env, checkpoint)).error.code, 'STALE');
  await kernel.stopAll(); kernel.assertNoResources();
});

test('checkpoint pause/resume includes active dependents while unrelated plugins remain active', async () => {
  const { kernel, runtime } = await fixture(); const env = { vaultId: 'a', generation: 1 }; await runtime.open(env);
  const data = { ...manifest(), provides: [{ kind: 'api', id: 'test.value', version: '1.0.0' }] };
  await runtime.register(env, data, source(data, `ctx.provide({kind:'api',id:'test.value',version:'1.0.0'},{read(){return 1}});`), true);
  const dependent = { ...manifest('1.0.0','test.dependent'), requires: [{ kind: 'api', id: 'test.value', range: '^1.0.0' }] };
  await runtime.register(env, dependent, source(dependent, `ctx.use({kind:'api',id:'test.value',version:'1.0.0'}).read();`), true);
  await runtime.register(env, manifest('1.0.0','test.unrelated'), source(manifest('1.0.0','test.unrelated')), true);
  const unrelated = kernel.inspect().plugins.find(item => item.manifest.id === 'test.unrelated').activationId;
  const checkpoint = (await runtime.suspend(env, data.id)).value;
  assert.equal(runtime.snapshot(env).value.find(item => item.id === dependent.id).state, 'stopped');
  assert.equal(runtime.snapshot(env).value.find(item => item.id === 'test.unrelated').state, 'active');
  assert.equal((await runtime.resume(env, checkpoint)).ok, true);
  assert.equal(runtime.snapshot(env).value.find(item => item.id === dependent.id).state, 'active');
  assert.equal(kernel.inspect().plugins.find(item => item.manifest.id === 'test.unrelated').activationId, unrelated);
  await runtime.finish(env, checkpoint); await kernel.stopAll(); kernel.assertNoResources();
});
