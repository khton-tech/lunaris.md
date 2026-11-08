import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountSessionChanged, ConnectionChanged, Drafts } from '@lunaris/remote';
test('session and connection events reject malformed state', () => {
  assert.equal(AccountSessionChanged.validate({ current: null }), true);
  assert.equal(AccountSessionChanged.validate({ current: { server: 'https://s', epoch: 'e', account: { id: 'a', login: 'alice' } } }), true);
  for (const value of [null, {}, { current: {} }, { current: { account: {} } }]) assert.equal(AccountSessionChanged.validate(value), false);
  assert.equal(ConnectionChanged.validate({ state: 'expired', epoch: 'e' }), true);
  assert.equal(ConnectionChanged.validate({ state: 'unknown', epoch: 'e' }), false);
});
test('draft storage requires conditional removal and rejects accessor methods', () => {
  assert.equal(Drafts.validate({ load() {}, save() {}, remove() {} }), true);
  assert.equal(Drafts.validate({ load() {}, save() {} }), false);
  assert.equal(Drafts.validate({ load() {}, save() {}, get remove() { throw Error('must not run'); } }), false);
});
