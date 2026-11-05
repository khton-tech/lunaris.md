import test from 'node:test';
import assert from 'node:assert/strict';
import { Themes, ThemeChanged } from '@lunaris/themes';

test('theme contracts expose a replaceable data service without rendering permissions', () => {
  assert.equal(Themes.consumePermission, undefined);
  assert.equal(Themes.validate(Object.fromEntries(['register', 'update', 'get', 'list', 'current', 'select'].map(name => [name, () => {}]))), true);
  assert.equal(Themes.validate({ register() {} }), false);
  assert.ok(Object.isFrozen(Themes));
});

test('theme change payloads cover data updates, selection clearing and owner removal', () => {
  for (const kind of ['registered', 'updated', 'removed', 'selected']) {
    assert.equal(ThemeChanged.validate({ kind, themeId: 'test.theme', previous: null, current: 'test.theme' }), true);
  }
  assert.equal(ThemeChanged.validate({ kind: 'selected', themeId: null, previous: 'test.theme', current: null }), true);
  for (const change of [null, {}, { kind: 'other' }, { kind: 'removed', themeId: null, previous: null, current: null },
    { kind: 'selected', themeId: null, previous: 1, current: null }, { get kind() { throw Error('Getter'); } }]) {
    assert.equal(ThemeChanged.validate(change), false);
  }
});
