import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { defineApi } from '@lunaris/sdk';
import { deferred, host, plugin, snapshot } from './helpers.mjs';

const flush = () => setImmediate();

test('host observations are deferred, coalesced and idle without timers', async () => {
  const observations = [];
  const { kernel, clock } = host({ onChange: () => observations.push(kernel.inspect()) });
  kernel.register(plugin('observe.first'));
  kernel.register(plugin('observe.second'));
  assert.equal(observations.length, 0);
  await flush();
  assert.equal(observations.length, 1);
  assert.equal(observations[0].plugins.length, 2);
  await flush();
  assert.equal(observations.length, 1);
  assert.equal(clock.tasks.size, 0);
  await kernel.unregister('observe.first');
  await flush();
  assert.deepEqual(observations.at(-1).plugins.map(entry => entry.manifest.id), ['observe.second']);
});

test('host observations cover asynchronous lifecycle, nested resources, grants and diagnostics', async () => {
  const entered = deferred();
  const finish = deferred();
  const observations = [];
  let context;
  const { kernel } = host({ onChange: () => observations.push(kernel.inspect()) });
  kernel.register(plugin('observe.plugin', async ctx => {
    context = ctx;
    entered.resolve();
    await finish.promise;
  }, { optionalPermissions: ['observe.permission'] }));
  const starting = kernel.start('observe.plugin');
  await entered.promise;
  await flush();
  assert.equal(observations.at(-1).plugins[0].state, 'starting');
  finish.resolve();
  await starting;
  await flush();
  assert.equal(observations.at(-1).plugins[0].state, 'active');
  const child = context.scope.child();
  child.own({ dispose() {} });
  kernel.grant('observe.plugin', 'observe.permission');
  await flush();
  assert.equal(observations.at(-1).plugins[0].ownedResources, 2);
  assert.deepEqual(observations.at(-1).plugins[0].effectivePermissions, ['observe.permission']);
  await child.dispose();
  kernel.revoke('observe.plugin', 'observe.permission');
  assert.throws(() => context.permissions.has('observe.undeclared'), { code: 'PERMISSION_DENIED' });
  await flush();
  assert.equal(observations.at(-1).plugins[0].ownedResources, 0);
  assert.deepEqual(observations.at(-1).plugins[0].effectivePermissions, []);
  assert.equal(observations.at(-1).diagnostics.at(-1).code, 'PERMISSION_DENIED');
  await context.scope.dispose();
  await flush();
  assert.equal(observations.at(-1).plugins[0].state, 'stopped');
  assert.ok(observations.some(value => value.plugins[0]?.state === 'stopping'));
});

test('approved asynchronous permission requests notify the host', async () => {
  const approval = deferred();
  let context;
  const observations = [];
  const { kernel } = host({ requestPermission: () => approval.promise, onChange: () => observations.push(kernel.inspect()) });
  kernel.register(plugin('observe.plugin', ctx => { context = ctx; }, { optionalPermissions: ['observe.permission'] }));
  await kernel.start('observe.plugin');
  const request = context.permissions.request('observe.permission');
  approval.resolve(true);
  assert.equal(await request, true);
  await flush();
  assert.deepEqual(observations.at(-1).plugins[0].effectivePermissions, ['observe.permission']);
  await kernel.stopAll();
});

test('ordinary API calls stay silent and publication removal notifies required consumer shutdown', async () => {
  const api = defineApi({ id: 'observe.api', version: '1.0.0' });
  let registration;
  let handle;
  let calls = 0;
  let notifications = 0;
  const { kernel } = host({ onChange: () => { notifications++; } });
  kernel.register(plugin('observe.provider', ctx => {
    registration = ctx.provide(api, { ping() { return ++calls; } });
  }, { provides: [{ kind: 'api', id: api.id, version: api.version }] }));
  kernel.register(plugin('observe.consumer', ctx => { handle = ctx.use(api); }, {
    requires: [{ kind: 'api', id: api.id, range: '^1.0.0' }],
  }));
  await kernel.start('observe.consumer');
  await flush();
  const before = notifications;
  for (let index = 0; index < 100; index++) handle.ping();
  await flush();
  assert.equal(notifications, before);
  registration.dispose();
  await flush();
  assert.ok(notifications > before);
  assert.equal(snapshot(kernel, 'observe.consumer').state, 'stopped');
  assert.deepEqual(snapshot(kernel, 'observe.provider').contracts, []);
  await kernel.stopAll();
});

test('late cleanup failures after activation timeout notify the host', async () => {
  const entered = deferred();
  const finish = deferred();
  const observations = [];
  const { kernel, clock } = host({ onChange: () => observations.push(kernel.inspect()) });
  kernel.register(plugin('observe.plugin', async () => {
    entered.resolve();
    await finish.promise;
    return { dispose() { throw new Error('late cleanup'); } };
  }));
  const rejected = assert.rejects(kernel.start('observe.plugin'), { code: 'ACTIVATION_TIMEOUT' });
  await entered.promise;
  clock.fire();
  await rejected;
  await flush();
  assert.equal(observations.at(-1).plugins[0].state, 'failed');
  const before = observations.length;
  finish.resolve();
  await flush();
  assert.ok(observations.length > before);
  assert.equal(observations.at(-1).diagnostics.at(-1).code, 'CLEANUP_FAILED');
  assert.equal(observations.at(-1).plugins[0].ownedResources, 0);
});

test('invalid observers are rejected and observer exceptions do not change lifecycle results', async () => {
  assert.throws(() => host({ onChange: 1 }), { code: 'LIFECYCLE_INVALID' });
  for (const onChange of [() => { throw new Error('host observer'); }, async () => { throw new Error('async host observer'); }]) {
    const { kernel } = host({ onChange });
    kernel.register(plugin('observe.plugin'));
    await kernel.start('observe.plugin');
    assert.equal(snapshot(kernel, 'observe.plugin').state, 'active');
    await kernel.stopAll();
  }
});
