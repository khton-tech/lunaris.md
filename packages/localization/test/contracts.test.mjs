import test from 'node:test';
import assert from 'node:assert/strict';
import { Localization, LocaleChanged } from '@lunaris/localization';

test('localization contracts validate method shape and locale change payloads', () => {
  assert.equal(Localization.id, 'lunaris.localization');
  assert.equal(Localization.consumePermission, undefined);
  assert.equal(Localization.validate({ locale() {}, locales() {}, setLocale() {}, register() {}, text() {} }), true);
  assert.equal(Localization.validate({ text() {} }), false);
  assert.equal(Localization.validate({ get locale() { throw new Error('Must not execute'); } }), false);
  assert.equal(LocaleChanged.validate({ previous: 'en', current: 'fr' }), true);
  assert.equal(LocaleChanged.validate({ previous: 'en', current: null }), false);
  assert.equal(LocaleChanged.validate(null), false);
});
