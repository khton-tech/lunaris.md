import test from 'node:test';
import assert from 'node:assert/strict';
import { ActiveDocument, ActiveDocumentChanged } from '@lunaris/active-document';
test('active document event accepts explicit Vault-relative state and rejects ambiguous paths', () => {
  assert.equal(ActiveDocument.kind, 'api'); assert.equal(ActiveDocument.consumePermission, 'vault.access');
  for (const current of [null, { vaultId: 'a', path: 'note.md' }]) assert.equal(ActiveDocumentChanged.validate({ current }), true);
  for (const current of [{ path: 'note.md' }, { vaultId: '', path: 'note.md' }, { vaultId: 'a', path: '../note.md' }, { vaultId: 'a', path: 'C:/note.md' }]) assert.equal(ActiveDocumentChanged.validate({ current }), false);
});
