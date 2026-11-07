import test from 'node:test';
import assert from 'node:assert/strict';
import { Settings, SettingsChanged } from '@lunaris/settings';
test('settings expose portable registry contracts without storage or rendering methods', () => {
  assert.equal(Settings.id, 'lunaris.settings'); assert.equal(Settings.version, '1.0.0');
  assert.equal(Settings.validate({ registerCategory() {}, registerSection() {}, updateCategory() {}, updateSection() {}, snapshot() {} }), true);
  assert.equal(Settings.validate({ snapshot() {} }), false);
  assert.equal(SettingsChanged.validate({ categories: [], sections: [] }), true);
  assert.equal(SettingsChanged.validate({ categories: [] }), false);
});
