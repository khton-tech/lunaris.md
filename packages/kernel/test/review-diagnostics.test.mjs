import test from 'node:test';
import assert from 'node:assert/strict';
import { defineEvent } from '@lunaris/sdk';
import { host, plugin } from './helpers.mjs';

test('trusted host retrieves correlated raw failures without snapshot traversal; eviction removes detail', async () => {
  const { kernel } = host({ diagnosticCapacity: 2 });
  const event = defineEvent({ id: 'review.event', version: '1.0.0' });
  const first = new Error('first approved detail'), second = new Error('second approved detail');
  let touched = 0;
  const opaque = new Proxy({}, { get() { touched++; throw new Error('must not inspect'); }, getPrototypeOf() { touched++; throw new Error('must not inspect'); } });
  const failures = [first, second, opaque]; let owner;
  kernel.register(plugin('review.provider', ctx => { owner = ctx; }, { provides: [{ kind: 'event', id: event.id, version: event.version }] }));
  kernel.register(plugin('review.consumer', ctx => {
    assert.equal('diagnosticCause' in ctx, false);
    ctx.events.on(event, () => { throw failures.shift(); });
  }, { requires: [{ kind: 'event', id: event.id, range: '^1.0.0' }] }));
  await kernel.start('review.consumer');
  await owner.events.emit(event, null); const one = kernel.inspect().diagnostics.at(-1);
  await owner.events.emit(event, null); const two = kernel.inspect().diagnostics.at(-1);
  assert.equal(kernel.diagnosticCause(one.sequence).cause, first);
  assert.equal(kernel.diagnosticCause(two.sequence).cause.message, 'second approved detail');
  assert.ok(Object.isFrozen(kernel.diagnosticCause(one.sequence)));
  await owner.events.emit(event, null); const three = kernel.inspect().diagnostics.at(-1);
  assert.deepEqual(three.cause, { kind: 'object' });
  assert.equal(kernel.diagnosticCause(three.sequence).cause, opaque); assert.equal(touched, 0);
  assert.equal(kernel.diagnosticCause(one.sequence), undefined);
  assert.equal(kernel.diagnosticCause(9999), undefined);
  await kernel.stopAll();
});
