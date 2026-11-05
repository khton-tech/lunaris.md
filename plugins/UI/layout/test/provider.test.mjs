import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '@lunaris/sdk';
import { createTestKernel } from '@lunaris/test';
import { Logger } from '@lunaris/logging';
import { Slots, SlotDriver, slotFailure } from '@lunaris/slots';
import provider from '@lunaris/slot-provider';

async function setup(create = () => ({ ok: true, value: null })) {
  const host = createTestKernel(); const logs = [];
  host.installMock(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(name => [name, (...args) => { logs.push([name, ...args]); return true; }])));
  host.installMock(SlotDriver, { create }, { grants: ['ui.surface'] });
  host.register(provider); host.grant(provider.manifest.id, 'ui.surface');
  let slots; let ctx;
  host.register(definePlugin({ manifest: { manifestVersion: 1, id: 'test.consumer', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js',
    provides: [], requires: [{ kind: 'api', id: Slots.id, range: '^1.0.0' }], permissions: [], optionalPermissions: [] }, activate(context) { ctx = context; slots = ctx.use(Slots); } }));
  await host.start('test.consumer');
  return { host, slots, ctx, logs, async stop() { await host.stopAll(); host.assertNoResources(); assert.deepEqual(host.diagnostics(), []); } };
}

test('named nested allocations have deterministic order and immutable detached metadata', async () => {
  const s = await setup();
  const request = { id: 'test.body', direction: 'row', grow: 1 };
  assert.equal(s.slots.create(request, s.ctx.signal).ok, true); request.grow = 5;
  for (const [id, order] of [['test.later', 2], ['test.first', -1], ['test.tie', 2]]) {
    assert.equal(s.slots.create({ id, parent: 'test.body', order }, s.ctx.signal).ok, true);
  }
  assert.equal(s.slots.get('test.body').grow, 1);
  assert.deepEqual(s.slots.list('test.body').map(slot => slot.id), ['test.first', 'test.later', 'test.tie']);
  assert.ok(Object.isFrozen(s.slots.list())); assert.ok(Object.isFrozen(s.slots.get('test.body')));
  assert.ok(s.logs.some(([level, source, , details]) => level === 'info' && source === provider.manifest.id && details.code === 'SLOTS_READY'));
  await s.stop();
});

test('duplicates, absent parents and invalid owners are rejected without calling the driver', async () => {
  let calls = 0; const s = await setup(() => { calls++; return { ok: true, value: null }; });
  assert.equal(s.slots.create({ id: 'test.one' }, s.ctx.signal).ok, true);
  assert.equal(s.slots.create({ id: 'test.one' }, s.ctx.signal).error.code, 'ALREADY_EXISTS');
  assert.equal(s.slots.create({ id: 'test.two', parent: 'test.absent' }, s.ctx.signal).error.code, 'PARENT_MISSING');
  assert.equal(s.slots.create({ id: 'test.three' }, null).error.code, 'INVALID_ARGUMENT');
  const owner = s.ctx.scope.child(); await owner.dispose();
  assert.equal(s.slots.create({ id: 'test.four' }, owner.signal).error.code, 'INVALID_ARGUMENT');
  assert.equal(calls, 1); await s.stop();
});

test('parent release cascades across different owners; old child owners cannot delete replacement slots', async () => {
  const s = await setup(); const parent = s.ctx.scope.child(); const child = s.ctx.scope.child();
  s.slots.create({ id: 'test.parent' }, parent.signal);
  s.slots.create({ id: 'test.child', parent: 'test.parent' }, child.signal);
  await parent.dispose();
  assert.equal(s.slots.get('test.parent'), undefined); assert.equal(s.slots.get('test.child'), undefined);
  assert.equal(s.slots.create({ id: 'test.child' }, s.ctx.signal).ok, true);
  await child.dispose(); assert.ok(s.slots.get('test.child'));
  await s.stop();
});

test('driver failure leaves the ID available for a later retry', async () => {
  let fail = true; const s = await setup(() => fail ? slotFailure('DRIVER_FAILED', 'Test failure') : { ok: true, value: null });
  assert.equal(s.slots.create({ id: 'test.retry' }, s.ctx.signal).error.code, 'DRIVER_FAILED');
  assert.equal(s.slots.get('test.retry'), undefined); fail = false;
  assert.equal(s.slots.create({ id: 'test.retry' }, s.ctx.signal).ok, true);
  await s.stop();
});

test('consumer restart releases allocations and rejects stale SDK handles', async () => {
  const s = await setup(); s.slots.create({ id: 'test.one' }, s.ctx.signal);
  await s.host.stop('test.consumer'); assert.throws(() => s.slots.get('test.one'));
  await s.host.start('test.consumer');
  await s.stop();
});
