import test from 'node:test';
import assert from 'node:assert/strict';
import { Slots, SlotDriver, ROOT_SLOT, normalizeSlot } from '@lunaris/slots';

test('slot contracts separate portable allocation from privileged rendering', () => {
  assert.equal(Slots.consumePermission, undefined);
  assert.equal(SlotDriver.consumePermission, 'ui.surface');
  assert.equal(Slots.validate({ create() {}, get() {}, list() {} }), true);
  assert.equal(Slots.validate({ get() {} }), false);
  assert.equal(SlotDriver.validate({ create() {} }), true);
  assert.ok(Object.isFrozen(ROOT_SLOT));
});

test('requests normalize to immutable snapshots and reject invalid structural data without getters', () => {
  assert.deepEqual(normalizeSlot({ id: 'test.body' }), { id: 'test.body', parent: 'root', direction: 'column', order: 0, grow: 0 });
  assert.ok(Object.isFrozen(normalizeSlot({ id: 'test.body' })));
  for (const input of [null, [], {}, { id: 'root' }, { id: 'bad/name' }, { id: 'test.body', parent: null },
    { id: 'test.body', direction: 'grid' }, { id: 'test.body', order: 0.5 }, { id: 'test.body', grow: -1 },
    { id: 'test.body', grow: Infinity }, { id: 'test.body', other: true }, { get id() { throw Error('Getter'); } }]) {
    assert.equal(normalizeSlot(input), undefined);
  }
});
