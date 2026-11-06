import test from 'node:test';
import assert from 'node:assert/strict';
import { Vault, VaultLocations, VaultChanged, VaultHistory, VaultHistoryChanged, PrepareVault, validVaultName } from '@lunaris/vault';

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
  assert.equal(PrepareVault.validate({ vault: first, error: null, requestedName: 'Notes', displayName: 'Saved' }), true);
  assert.equal(PrepareVault.validate({ vault: first, error: null, displayName: '' }), false);
  assert.equal(VaultLocations.validate({ select() {}, open() {}, describe() {} }), true);
  assert.equal(VaultLocations.validate({ open() {} }), false);
  assert.equal(VaultChanged.validate({ kind: 'opened', previous: null, current: first, location: { reference: 'saved', label: 'Notes' } }), true);
  assert.equal(VaultChanged.validate({ kind: 'closed', previous: first, current: null, location: { reference: 'saved', label: 'Notes' } }), false);
  for (const name of ['', ' padded ', '\u0000', 'x'.repeat(201)]) assert.equal(validVaultName(name), false);
  assert.equal(VaultHistory.validate({ list() {}, open() {} }), true);
  assert.equal(VaultHistoryChanged.validate({ entries: [{ name: 'Notes', location: { reference: 'saved', label: 'Notes' } }] }), true);
  assert.equal(VaultHistoryChanged.validate({ entries: [{ name: 'Notes', location: { reference: '' } }] }), false);
});
