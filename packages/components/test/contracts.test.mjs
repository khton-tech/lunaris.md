import test from 'node:test';
import assert from 'node:assert/strict';
import { Components, ComponentsChanged } from '@lunaris/components';

test('component API is a DOM-permissioned contract with method validation', () => {
  assert.equal(Components.id, 'lunaris.components');
  assert.equal(Components.consumePermission, 'ui.dom');
  assert.equal(Components.providePermission, 'ui.dom');
  const methods = { register() {}, has() {}, list() {}, mount() {} };
  assert.equal(Components.validate(methods), true);
  assert.equal(Components.validate({ ...methods, mount: null }), false);
  assert.equal(Components.validate(null), false);
});

test('change event payloads are validated', () => {
  assert.equal(ComponentsChanged.validate({ kind: 'registered', componentId: 'lunaris.button' }), true);
  assert.equal(ComponentsChanged.validate({ kind: 'removed', componentId: 'lunaris.button' }), true);
  assert.equal(ComponentsChanged.validate({ kind: 'updated', componentId: 'lunaris.button' }), false);
  assert.equal(ComponentsChanged.validate({ kind: 'removed', componentId: null }), false);
});
