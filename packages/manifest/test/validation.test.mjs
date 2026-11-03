import test from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest, versionSatisfies } from '@lunaris/manifest';

function fixture(overrides = {}) {
  return {
    manifestVersion: 1, id: 'example.plugin', version: '1.0.0+build.1',
    engine: '^0.1.0', sdk: '^0.1.0', entry: './dist/plugin.js',
    provides: [{ kind: 'api', id: 'example.greeting', version: '1.0.0' }],
    requires: [{ kind: 'event', id: 'example.changed', range: '^1.0.0', optional: true }],
    permissions: ['example.write'], optionalPermissions: ['example.read'], ...overrides,
  };
}

function invalid(value, path, code = 'MANIFEST_INVALID') {
  const result = validateManifest(value);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(d => d.path === path && d.code === code), JSON.stringify(result));
  return result;
}

test('copies and deeply freezes valid metadata, preserving full versions', () => {
  const source = fixture();
  const result = validateManifest(source, { engineVersion: '0.1.0', sdkVersion: '0.1.9' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.manifest, source);
  source.provides[0].id = 'example.changed';
  source.permissions.push('example.other');
  assert.equal(result.manifest.provides[0].id, 'example.greeting');
  assert.deepEqual(result.manifest.permissions, ['example.write']);
  assert.throws(() => { result.manifest.requires[0].optional = false; }, TypeError);
  assert.throws(() => result.manifest.permissions.push('example.other'), TypeError);
});

for (const [field, bad] of [
  ['manifestVersion', 2], ['id', 'NoDots'], ['id', 'example.Bad'], ['id', 'example.id\n'],
  ['version', 'v1.0.0'], ['version', '1.0'], ['version', '01.0.0'],
  ['version', '1.0.0-alpha.01'], ['version', '1.0.0\n'], ['engine', ''], ['sdk', 'nonsense'],
  ['provides', {}], ['requires', null], ['permissions', undefined],
]) {
  test(`rejects invalid ${field}: ${String(bad)}`, () => {
    const result = invalid(fixture({ [field]: bad }), `$.${field}`);
    if (field !== 'id') assert.equal(result.diagnostics[0].pluginId, 'example.plugin');
  });
}

for (const entry of [
  '../plugin.js', './a/../plugin.js', './a//plugin.js', '././plugin.js',
  './a\\plugin.js', './plugin.ts', './plugin.js#entry', './plugin.js?x',
  'https://example.com/plugin.js', './%2e%2e/plugin.js', './C:/plugin.js', './a\0.js',
]) {
  test(`rejects unsafe entry ${JSON.stringify(entry)}`, () => invalid(fixture({ entry }), '$.entry'));
}

test('all required fields and unknown keys are checked with paths', () => {
  for (const key of Object.keys(fixture())) {
    const source = fixture();
    delete source[key];
    invalid(source, `$.${key}`);
  }
  invalid(fixture({ unexpected: true }), '$.unexpected');
  invalid(fixture({ provides: [{ kind: 'api', id: 'example.api', version: '1.0.0', optional: true }] }), '$.provides[0].optional');
});

test('checks declaration kinds, versions, ranges and duplicate kind/IDs', () => {
  invalid(fixture({ provides: [{ kind: 'other', id: 'example.api', version: '1.0.0' }] }), '$.provides[0].kind');
  invalid(fixture({ provides: [{ kind: 'api', id: 'INVALID', version: '1.0' }] }), '$.provides[0].id');
  const provided = fixture().provides[0];
  invalid(fixture({ provides: [provided, { ...provided, version: '2.0.0' }] }), '$.provides[1]');
  const required = fixture().requires[0];
  invalid(fixture({ requires: [required, { ...required, optional: false }] }), '$.requires[1]');
  invalid(fixture({ requires: [{ ...required, range: '' }] }), '$.requires[0].range');
  invalid(fixture({ requires: [{ ...required, optional: undefined }] }), '$.requires[0].optional');
  assert.equal(validateManifest(fixture({ provides: [provided, { ...provided, kind: 'event' }] })).ok, true);
});

test('permissions are atomic, distinct, and never treated as grants', () => {
  invalid(fixture({ permissions: ['example.*'] }), '$.permissions[0]');
  invalid(fixture({ permissions: ['example.read', 'example.read'] }), '$.permissions[1]');
  invalid(fixture({ optionalPermissions: ['example.write'] }), '$.optionalPermissions[0]');
});

test('compatibility checks are explicit and retain field/plugin context', () => {
  const result = validateManifest(fixture(), { engineVersion: '0.2.0', sdkVersion: 'invalid' });
  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics.map(d => [d.code, d.path, d.pluginId]), [
    ['VERSION_INCOMPATIBLE', '$.engine', 'example.plugin'],
    ['VERSION_INCOMPATIBLE', '$.sdk', 'example.plugin'],
  ]);
});

test('standard prerelease/range behavior is delegated to semver', () => {
  assert.equal(versionSatisfies('1.2.3', '^1.0.0'), true);
  assert.equal(versionSatisfies('2.0.0', '^1.0.0'), false);
  assert.equal(versionSatisfies('1.2.3-beta.1', '^1.0.0'), false);
  assert.equal(versionSatisfies('1.2.3-beta.2', '>=1.2.3-beta.1 <2'), true);
  assert.equal(versionSatisfies('1.2.4-beta.1', '>=1.2.3-beta.1 <2'), false);
  assert.equal(versionSatisfies('v1.2.3', '*'), false);
});

test('rejects non-JSON records, sparse arrays and accessors without invoking them', () => {
  for (const source of [null, [], new Date(), 'manifest']) invalid(source, '$');
  let reads = 0;
  const source = fixture();
  Object.defineProperty(source, 'id', { get() { reads++; return 'example.plugin'; }, enumerable: true });
  invalid(source, '$');
  const list = new Array(1);
  invalid(fixture({ provides: list }), '$.provides');
  invalid(fixture({ provides: new (class extends Array {})() }), '$.provides');
  Object.defineProperty(list, '0', { get() { reads++; return {}; }, enumerable: true });
  invalid(fixture({ provides: list }), '$.provides');
  assert.equal(reads, 0);
  const throwing = new Proxy({}, { ownKeys() { throw new Error('fixture'); } });
  invalid(throwing, '$');
});
