import test from 'node:test';
import assert from 'node:assert/strict';
import { ContextMenu } from '@lunaris/context-menu';
test('context menu exposes a replaceable public SDK contract', () => {
  assert.equal(ContextMenu.id, 'lunaris.context-menu'); assert.equal(ContextMenu.version, '1.0.0');
  assert.equal(ContextMenu.validate({ register() {}, resolve() {}, open() {} }), true);
  assert.equal(ContextMenu.validate({ register() {} }), false);
});
