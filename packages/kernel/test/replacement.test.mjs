import test from 'node:test';
import assert from 'node:assert/strict';
import { defineApi } from '@lunaris/sdk';
import { host, plugin, deferred, snapshot } from './helpers.mjs';

const Api = defineApi({ id: 'example.value', version: '1.0.0' });
const provides = { provides: [{ kind: 'api', id: Api.id, version: Api.version }] };
const requires = optional => ({ requires: [{ kind: 'api', id: Api.id, range: '^1.0.0', ...(optional ? { optional: true } : {}) }] });
const provider = value => plugin('example.provider', ctx => ctx.provide(Api, { read: () => value }), provides);

test('replacement restarts required and optional consumers and preserves unrelated activations', async () => {
  const { kernel } = host(); const handles = []; const starts = [];
  kernel.register(provider(1));
  for (const optional of [false, true]) kernel.register(plugin(`example.${optional ? 'optional' : 'required'}`, ctx => {
    handles.push(optional ? ctx.optional(Api) : ctx.use(Api)); starts.push(ctx.pluginId);
  }, requires(optional)));
  kernel.register(plugin('example.unrelated'));
  await kernel.start('example.required'); await kernel.start('example.optional'); await kernel.start('example.unrelated');
  const old = snapshot(kernel, 'example.provider').activationId;
  const unrelated = snapshot(kernel, 'example.unrelated').activationId;
  await kernel.replace(provider(2));
  assert.notEqual(snapshot(kernel, 'example.provider').activationId, old);
  assert.equal(snapshot(kernel, 'example.unrelated').activationId, unrelated);
  assert.equal(starts.length, 4);
  for (const handle of handles.slice(0, 2)) assert.throws(() => handle.read(), error => ['SCOPE_CLOSED', 'PROVIDER_UNAVAILABLE'].includes(error.code));
  for (const handle of handles.slice(2)) assert.equal(handle.read(), 2);
  await kernel.stopAll();
});

test('failed candidate restores previous code and active consumers with fresh scopes', async () => {
  const { kernel } = host(); const handles = [];
  kernel.register(provider(1));
  kernel.register(plugin('example.consumer', ctx => { handles.push(ctx.use(Api)); }, requires(false)));
  await kernel.start('example.consumer');
  await assert.rejects(kernel.replace(plugin('example.provider', () => { throw Error('candidate failure'); }, provides)), { code: 'ACTIVATION_FAILED' });
  assert.equal(handles.length, 2); assert.equal(handles[1].read(), 1);
  assert.equal(snapshot(kernel, 'example.consumer').state, 'active');
  assert.throws(() => handles[0].read()); await kernel.stopAll();
});

test('unregister closes consumers and removes index entries, selections and stale handles', async () => {
  const { kernel } = host(); let handle;
  kernel.register(provider(1));
  kernel.register(plugin('example.consumer', ctx => { handle = ctx.use(Api); }, requires(false)));
  kernel.selectProvider('example.consumer', 'api', Api.id, 'example.provider');
  await kernel.start('example.consumer'); await kernel.unregister('example.provider');
  assert.equal(snapshot(kernel, 'example.provider'), undefined);
  assert.equal(snapshot(kernel, 'example.consumer').state, 'stopped'); assert.throws(() => handle.read());
  await assert.rejects(kernel.start('example.consumer'), { code: 'PROVIDER_MISSING' });
  kernel.register(plugin('example.new-provider', ctx => ctx.provide(Api, { read: () => 3 }), provides));
  await kernel.start('example.consumer'); assert.equal(handle.read(), 3); await kernel.stopAll();
});

test('mutation reserves boundary, rejects concurrent management, and retains registration on unsafe cleanup', async () => {
  const { kernel } = host(); const entered = deferred(); const gate = deferred();
  kernel.register(plugin('example.provider', () => ({ async dispose() { entered.resolve(); await gate.promise; throw Error('unsafe cleanup'); } })));
  await kernel.start('example.provider'); const removal = kernel.unregister('example.provider'); await entered.promise;
  await assert.rejects(kernel.start('example.provider'), { code: 'LIFECYCLE_INVALID' });
  await assert.rejects(kernel.unregister('example.provider'), { code: 'LIFECYCLE_INVALID' });
  assert.throws(() => kernel.register(plugin('example.other')), { code: 'LIFECYCLE_INVALID' });
  gate.resolve(); await assert.rejects(removal, { code: 'CLEANUP_FAILED' });
  assert.equal(snapshot(kernel, 'example.provider').state, 'failed');
});

test('replacement rejects pending lifecycle and incompatible metadata before mutation', async () => {
  const { kernel } = host(); const entered = deferred(); const gate = deferred();
  kernel.register(plugin('example.provider', async () => { entered.resolve(); await gate.promise; }));
  const starting = kernel.start('example.provider'); await entered.promise;
  await assert.rejects(kernel.replace(provider(2)), { code: 'LIFECYCLE_INVALID' });
  gate.resolve(); await starting; const before = snapshot(kernel, 'example.provider').activationId;
  await assert.rejects(kernel.replace(plugin('example.provider', undefined, { engine: '^9.0.0' })), { code: 'VERSION_INCOMPATIBLE' });
  assert.equal(snapshot(kernel, 'example.provider').activationId, before); await kernel.stopAll();
});

test('replacement does not resurrect a revoked initial grant', async () => {
  const { kernel } = host({ initialGrants: { 'example.provider': ['example.read'] } });
  const definition = () => plugin('example.provider', undefined, { permissions: ['example.read'] });
  kernel.register(definition()); kernel.revoke('example.provider', 'example.read');
  await kernel.start('example.provider'); await kernel.replace(definition());
  assert.deepEqual(snapshot(kernel, 'example.provider').effectivePermissions, []); await kernel.stopAll();
});
