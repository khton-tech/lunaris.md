import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { defineApi, definePlugin } from '@lunaris/sdk';
import { Logger } from '@lunaris/logging';
import { Vault, VaultPreservation } from '@lunaris/vault';
import { LimeCompositionRuntime, LimeRuntime } from '@lunaris/lime';
import execution from '@lunaris/quickjs-execution';
import { TestScheduler } from '@lunaris/test';
import { HostSession } from '../dist/session.js';

const Feature = defineApi({ id: 'test.feature', version: '1.0.0' });
const content = (id, extra) => ({ manifestVersion: 1, id, version: '1.0.0', engine: '^0.1.0', sdk: '^0.1.0',
  entry: './index.js', provides: [], requires: [], permissions: [], optionalPermissions: [], ...extra });
const declared = token => ({ kind: token.kind, id: token.id, version: token.version });
const required = token => ({ kind: token.kind, id: token.id, range: '^1.0.0' });
const builtin = (id, provides, requires, activate, permissions = []) => definePlugin({
  manifest: content(id, { provides: provides.map(declared), requires: requires.map(required), permissions }), activate,
});
const consumers = ['test.primary', 'test.secondary'];
const standardId = 'test.original';
const alternateId = 'test.alternative';
const env = { vaultId: 'vault', generation: 1 };
const defaults = { bindings: [], disabledBuiltins: [] };
const profile = { bindings: consumers.map(consumerId => ({ consumerId, kind: 'api', contractId: Feature.id, providerId: alternateId })),
  disabledBuiltins: [standardId] };

async function fixture({ rejectSecondary = false, safeMode = false } = {}) {
  let runtime, composition, deny = false, leases = 0;
  const handles = new Map();
  const log = () => true;
  const plugins = [
    builtin('test.logger', [Logger], [], ctx => { ctx.provide(Logger, { log, debug: log, info: log, warn: log, error: log }); }),
    builtin('test.vault', [Vault, VaultPreservation], [], ctx => {
      ctx.provide(Vault, { current: () => null, async open() { return { ok: true, value: null }; }, async close() { return { ok: true, value: null }; } });
      ctx.provide(VaultPreservation, { async lock(id) {
        assert.equal(id, env.vaultId);
        if (deny) return { ok: false, error: { code: 'BUSY', message: 'Save pending.' } };
        leases++;
        return { ok: true, value: { dispose() { leases--; } } };
      } });
    }),
    execution,
    builtin(standardId, [Feature], [], ctx => { ctx.provide(Feature, { read: () => 1 }); }),
    ...consumers.map(id => builtin(id, [], [Feature], ctx => {
      const api = ctx.use(Feature);
      if (id === consumers[1] && rejectSecondary && api.read() === 2) throw Error('Rejected alternative');
      handles.set(id, api);
    })),
    builtin('test.manager', [], [LimeRuntime, LimeCompositionRuntime], ctx => {
      runtime = ctx.use(LimeRuntime);
      composition = ctx.use(LimeCompositionRuntime);
    }, ['runtime.manage']),
  ];
  const session = new HostSession({ scheduler: new TestScheduler(), load: async () => ({
    pluginRuntime: true, plugins, entrypoints: ['test.manager', standardId, ...consumers], grants: { 'test.manager': ['runtime.manage'] },
  }) });
  if (safeMode) await session.startSafeMode(); else await session.start();
  assert.equal(session.snapshot().phase, 'running');
  assert.equal((await runtime.open(env)).ok, true);
  const supplied = content(alternateId, { provides: [declared(Feature)] });
  const source = { entry: 'index.js', modules: { 'index.js': `export default { manifest: ${JSON.stringify(supplied)},
    activate(ctx) { ctx.provide(${JSON.stringify(declared(Feature))}, {read() {return 2}}); } };` } };
  assert.equal((await runtime.register(env, supplied, source, !safeMode)).ok, true);
  const view = id => session.snapshot().kernel.plugins.find(item => item.manifest.id === id);
  return { session, runtime, composition, handles, view, deny: () => { deny = true; }, allow: () => { deny = false; }, leases: () => leases };
}

test('owner composes two host entrypoints around a QuickJS provider and restores the defaults on Vault release', async () => {
  const f = await fixture();
  const before = f.composition.snapshot(env).value;
  const unaffected = f.view('test.manager').activationId;
  const old = f.handles.get(consumers[0]);
  assert.equal(before.builtins.find(item => item.id === 'test.vault').mutable, false);
  assert.equal(f.runtime.plan(env, consumers[0]).value.dependencies[0].selected, standardId);
  f.deny();
  assert.equal((await f.composition.apply(env, profile, before.revision)).error.code, 'CONFLICT');
  assert.equal(old.read(), 1);
  assert.equal((await f.composition.apply(env, profile, before.revision)).error.code, 'STALE');
  f.allow();
  assert.equal((await f.composition.apply(env, profile, f.composition.snapshot(env).value.revision)).ok, true);
  assert.equal(f.leases(), 0);
  assert.deepEqual(f.composition.snapshot(env).value.profile, profile);
  assert.throws(() => old.read(), { code: 'SCOPE_CLOSED' });
  assert.equal(f.view(standardId).suspended, true);
  assert.equal(f.view('test.manager').activationId, unaffected);
  assert.deepEqual(consumers.map(id => f.handles.get(id).read()), [2, 2]);
  assert.equal((await f.runtime.disable(env, alternateId)).error.code, 'CONFLICT');

  const checkpoint = await f.runtime.suspend(env, alternateId);
  assert.equal(checkpoint.ok, true);
  await setImmediate();
  assert.equal(f.session.snapshot().phase, 'running');
  assert.equal(f.view(consumers[0]).state, 'stopped');
  assert.equal((await f.runtime.resume(env, checkpoint.value)).ok, true);
  assert.equal((await f.runtime.finish(env, checkpoint.value)).ok, true);
  assert.equal((await f.runtime.close(env)).ok, true);
  assert.equal(f.view(alternateId), undefined);
  assert.equal(f.view(standardId).state, 'active');
  assert.deepEqual(consumers.map(id => f.handles.get(id).read()), [1, 1]);
  await setImmediate();
  assert.equal(f.session.snapshot().phase, 'running');
  await f.session.stop();
});

test('invalid and failing compositions keep the host running and protect the runtime foundation', async () => {
  const f = await fixture({ rejectSecondary: true });
  const apply = next => f.composition.apply(env, next, f.composition.snapshot(env).value.revision);
  const activation = f.view(consumers[0]).activationId;
  assert.equal((await apply({ ...defaults, disabledBuiltins: ['test.vault'] })).error.code, 'CONFLICT');
  assert.equal((await apply({ ...defaults, disabledBuiltins: [standardId] })).error.code, 'CONFLICT');
  assert.equal(f.view(consumers[0]).activationId, activation);
  assert.equal((await apply(profile)).error.code, 'RUNTIME_FAILED');
  assert.deepEqual(f.composition.snapshot(env).value.profile, defaults);
  assert.deepEqual(consumers.map(id => f.handles.get(id).read()), [1, 1]);
  assert.equal(f.leases(), 0);
  assert.equal(f.session.snapshot().phase, 'running');
  await f.session.stop();
});

test('safe mode permits only the default composition', async () => {
  const f = await fixture({ safeMode: true });
  assert.equal((await f.composition.apply(env, profile, f.composition.snapshot(env).value.revision)).error.code, 'CONFLICT');
  assert.equal((await f.composition.apply(env, defaults, f.composition.snapshot(env).value.revision)).ok, true);
  assert.equal(f.view(standardId).state, 'active');
  await f.session.stop();
});

test('an installed plugin can wrap the existing provider using the same public contract', async () => {
  const f = await fixture();
  const manifest = content('test.decorator', { provides: [declared(Feature)], requires: [required(Feature)] });
  const source = { entry: 'index.js', modules: { 'index.js': `const token = ${JSON.stringify(declared(Feature))};
    export default { manifest: ${JSON.stringify(manifest)}, activate(ctx) {
      const base = ctx.use(token);
      ctx.provide(token, {read() {return base.read() + 10}});
    } };` } };
  assert.equal((await f.runtime.register(env, manifest, source, false)).ok, true);
  const plan = f.runtime.plan(env, manifest.id).value;
  assert.equal((await f.runtime.selectProvider(env, manifest.id, 'api', Feature.id, standardId, plan.revision)).ok, true);
  assert.equal((await f.runtime.enable(env, manifest.id)).ok, true);
  const wrapping = { ...defaults, bindings: [{ ...profile.bindings[0], providerId: manifest.id }] };
  assert.equal((await f.composition.apply(env, wrapping, f.composition.snapshot(env).value.revision)).ok, true);
  assert.deepEqual(consumers.map(id => f.handles.get(id).read()), [11, 1]);
  await f.runtime.close(env);
  await f.session.stop();
});
