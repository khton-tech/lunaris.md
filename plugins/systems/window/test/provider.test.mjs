import test from 'node:test';
import assert from 'node:assert/strict';
import provider from '@lunaris/window-provider';

test('provider requires a replaceable driver and declares its public events', () => {
  assert.ok(provider.manifest.requires.some(item => item.id === 'lunaris.window-driver'));
  assert.ok(provider.manifest.requires.some(item => item.id === 'lunaris.logger'));
  assert.ok(provider.manifest.provides.some(item => item.id === 'lunaris.window-changed'));
});
