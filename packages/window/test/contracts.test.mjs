import test from 'node:test';
import assert from 'node:assert/strict';
import { validWindowSnapshot, Window, WindowDriver, windowMethods } from '@lunaris/window';
import { validExternalWindowPosition } from '@lunaris/window/external';

test('window tokens expose the same replaceable contract and validate state without getters', () => {
  assert.equal(Window.consumePermission, 'window.control');
  assert.equal(WindowDriver.providePermission, 'window.native');
  assert.ok(windowMethods.includes('close')); assert.ok(!windowMethods.includes('destroy'));
  const state = { sequence: 1, title: 'Lunaris', focused: true, maximized: false,
    capabilities: Object.fromEntries(['title', 'minimize', 'maximize', 'close', 'drag', 'customTitlebar'].map(key => [key, true])) };
  assert.equal(validWindowSnapshot(state), true);
  assert.equal(validWindowSnapshot({ ...state, sequence: -1 }), false);
  assert.equal(validWindowSnapshot({ ...state, capabilities: {} }), false);
  assert.equal(validWindowSnapshot({ get title() { throw Error('Getter executed'); } }), false);
});

test('external windows accept anchored offsets alongside desktop coordinates', () => {
  assert.equal(validExternalWindowPosition('bottom-right'), true);
  assert.equal(validExternalWindowPosition({ x: 0, y: -72 }), true);
  assert.equal(validExternalWindowPosition({ anchor: 'bottom-right', offset: { x: 0, y: -72 } }), true);
  assert.equal(validExternalWindowPosition({ anchor: 'center', offset: { x: 0, y: -72 } }), false);
  assert.equal(validExternalWindowPosition({ anchor: 'bottom-right' }), false);
  assert.equal(validExternalWindowPosition({ anchor: 'bottom-right', offset: { x: 0, y: NaN } }), false);
});
