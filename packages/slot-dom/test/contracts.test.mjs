import test from 'node:test';
import assert from 'node:assert/strict';
import { SlotDom } from '@lunaris/slot-dom';
test('DOM access is a separately permissioned browser contract', () => {
  assert.equal(SlotDom.consumePermission, 'ui.dom');
  assert.equal(SlotDom.providePermission, 'ui.dom');
  assert.equal(SlotDom.validate({ get() {} }), true);
  assert.equal(SlotDom.validate({ get: null }), false);
});
