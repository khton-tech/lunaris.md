import test from 'node:test';
import assert from 'node:assert/strict';
import { defineApi, defineEvent, defineHook } from '@lunaris/sdk';
import { host, plugin } from './helpers.mjs';

test('public SDK integrates dependency startup, API, events, hooks, grants, stop and restart', async () => {
  const Service = defineApi({ id: 'example.service', version: '1.0.0', consumePermission: 'example.execute' });
  const Changed = defineEvent({ id: 'example.changed', version: '1.0.0' });
  const Transform = defineHook({ id: 'example.transform', version: '1.0.0' });
  const advertise = token => ({ kind: token.kind, id: token.id, version: token.version });
  const require = token => ({ kind: token.kind, id: token.id, range: '^1.0.0' });
  const { kernel, clock } = host({ initialGrants: { 'example.consumer': ['example.execute'] } });
  let owner; let caller; let handle; const seen = [];
  kernel.register(plugin('example.owner', ctx => {
    owner = ctx;
    ctx.provide(Service, { async execute(input) {
      const output = await ctx.hooks.run(Transform, input); await ctx.events.emit(Changed, output); return output;
    } });
  }, { provides: [advertise(Service), advertise(Changed), advertise(Transform)] }));
  kernel.register(plugin('example.extensions', ctx => {
    ctx.events.on(Changed, output => { seen.push(output); }); ctx.hooks.register(Transform, text => text.toUpperCase());
  }, { requires: [require(Changed), require(Transform)] }));
  kernel.register(plugin('example.consumer', ctx => { caller = ctx; handle = ctx.use(Service); }, {
    requires: [require(Service)], permissions: ['example.execute'],
  }));
  await kernel.start('example.extensions'); await kernel.start('example.consumer');
  assert.equal(await handle.execute('hello'), 'HELLO'); assert.deepEqual(seen, ['HELLO']);
  kernel.revoke('example.consumer', 'example.execute'); assert.throws(() => handle.execute('blocked'), { code: 'PERMISSION_DENIED' });
  kernel.grant('example.consumer', 'example.execute'); const stale = handle;
  await kernel.restart('example.owner'); assert.ok(caller.signal.aborted); assert.throws(() => stale.execute('stale'), { code: 'SCOPE_CLOSED' });
  await kernel.start('example.extensions'); await kernel.start('example.consumer');
  assert.equal(await handle.execute('again'), 'AGAIN'); assert.deepEqual(seen, ['HELLO', 'AGAIN']);
  assert.equal(owner.signal.aborted, false); await kernel.stopAll();
  assert.ok(kernel.inspect().plugins.every(entry => entry.state === 'stopped' && entry.ownedResources === 0 && entry.contracts.length === 0));
  assert.equal(clock.tasks.size, 0);
});
