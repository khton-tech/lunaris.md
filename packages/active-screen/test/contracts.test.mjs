import test from 'node:test';
import assert from 'node:assert/strict';
import { ActiveScreen, ActiveScreenChanged } from '@lunaris/active-screen';

test('active screen contracts expose stable public metadata and reject malformed implementations', () => {
  assert.equal(ActiveScreen.id, 'lunaris.active-screen');
  assert.equal(ActiveScreen.version, '1.0.0');
  assert.equal(ActiveScreenChanged.id, 'lunaris.active-screen-changed');
  assert.equal(ActiveScreen.validate({ register() {}, update() {}, select() {}, snapshot() {} }), true);
  assert.equal(ActiveScreen.validate({ register() {} }), false);
  assert.equal(ActiveScreenChanged.validate({ screens: [], activeId: null }), true);
  assert.equal(ActiveScreenChanged.validate({ screens: [], activeId: 4 }), false);
});
