import test from 'node:test';
import assert from 'node:assert/strict';
import { Vault, VaultChanged, PrepareVault } from '@lunaris/vault';

test('Vault contracts validate methods, lifecycle transitions and preparation payloads', () => {
  const first = { id: 'a', name: 'Notes' }; const second = { id: 'b', name: 'Work' };
  assert.equal(Vault.consumePermission, 'vault.access');
  assert.equal(Vault.validate({ current() {}, open() {}, close() {} }), true);
  assert.equal(Vault.validate({ current() {}, open() {} }), false);
  for (const change of [
    { kind: 'opened', previous: null, current: first },
    { kind: 'switched', previous: first, current: second },
    { kind: 'closed', previous: second, current: null },
  ]) assert.equal(VaultChanged.validate(change), true);
  for (const change of [null, {}, { kind: 'opened', previous: first, current: second }, { kind: 'closed', previous: null, current: null }, { kind: 'switched', previous: first, current: { id: '' } }]) {
    assert.equal(VaultChanged.validate(change), false);
  }
  assert.equal(PrepareVault.validate({ vault: first, error: null }), true);
  assert.equal(PrepareVault.validate({ vault: first, error: 'Cannot initialize' }), true);
  assert.equal(PrepareVault.validate({ vault: first }), false);
});
