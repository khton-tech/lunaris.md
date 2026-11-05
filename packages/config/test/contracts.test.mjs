import test from 'node:test';
import assert from 'node:assert/strict';
import { Config, ConfigChanged, validPluginId, validConfigKey } from '@lunaris/config';

test('config contracts validate API shape, namespace IDs, literal keys and value-free events', () => {
  assert.equal(Config.consumePermission, 'config.access');
  assert.equal(Config.validate({ read() {}, get() {}, set() {}, remove() {} }), true);
  assert.equal(Config.validate({ get() {} }), false);
  for (const id of ['example.plugin', 'lunaris.my-plugin']) assert.equal(validPluginId(id), true);
  for (const id of ['', 'plugin', 'Example.plugin', '../other']) assert.equal(validPluginId(id), false);
  for (const key of ['theme', 'font.size', 'two words']) assert.equal(validConfigKey(key), true);
  for (const key of ['', '__proto__', 'constructor', 'prototype', 'bad\nkey']) assert.equal(validConfigKey(key), false);
  const change = { pluginId: 'example.plugin', key: 'theme', scope: 'global', vaultId: null, kind: 'set' };
  assert.equal(ConfigChanged.validate(change), true);
  assert.equal(ConfigChanged.validate({ ...change, scope: 'vault', vaultId: 'v', kind: 'removed' }), true);
  assert.equal(ConfigChanged.validate({ ...change, vaultId: 'v' }), false);
  assert.equal(ConfigChanged.validate({ ...change, scope: 'vault' }), false);
});
