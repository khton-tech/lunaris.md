import test from 'node:test';
import assert from 'node:assert/strict';
import {
  definePlugin, defineApi, defineEvent, defineHook, contractKey,
  assertCompatibleTokens, assertDeclaration, LunarisError,
} from '@lunaris/sdk';

const metadata = { id: 'example.greeting', version: '1.0.0' };
function manifest(overrides = {}) {
  return {
    manifestVersion: 1, id: 'example.plugin', version: '0.1.0',
    engine: '^0.1.0', sdk: '^0.1.0', entry: './dist/plugin.js',
    provides: [], requires: [], permissions: [], optionalPermissions: [], ...overrides,
  };
}
const api = defineApi(metadata);
const provide = { provides: [{ kind: 'api', ...metadata }] };
const requireApi = { requires: [{ kind: 'api', id: metadata.id, range: '^1.0.0' }] };

test('definition owns a frozen validated snapshot and never executes activation', () => {
  let calls = 0;
  const original = manifest();
  const activation = () => { calls++; };
  const definition = definePlugin({ manifest: original, activate: activation });
  assert.equal(calls, 0);
  assert.equal(definition.activate, activation);
  assert.ok(Object.isFrozen(definition));
  original.id = 'example.changed';
  assert.equal(definition.manifest.id, 'example.plugin');
  assert.notEqual(definition.manifest.permissions, original.permissions);
});

test('SDK definitions preserve advisory target support without executing activation', () => {
  const targets = { web: 'supported', android: 'unadapted', ios: 'unsupported' };
  let activated = false;
  const definition = definePlugin({ manifest: manifest({ targets }), activate() { activated = true; } });
  targets.android = 'supported';
  assert.deepEqual(definition.manifest.targets, { web: 'supported', android: 'unadapted', ios: 'unsupported' });
  assert.equal(Object.isFrozen(definition.manifest.targets), true);
  assert.equal(activated, false);
});

test('definitions reject repeated identity, malformed metadata and missing activation', () => {
  assert.throws(() => definePlugin({ manifest: manifest(), id: 'example.drift', activate() {} }),
    { code: 'MANIFEST_INVALID', context: { path: '$.id' } });
  assert.throws(() => definePlugin({ manifest: manifest({ version: '1' }), activate() {} }), error => {
    assert.ok(error instanceof LunarisError);
    assert.equal(error.context.pluginId, 'example.plugin');
    assert.equal(error.context.path, '$.version');
    assert.ok(Array.isArray(error.cause));
    return true;
  });
  assert.throws(() => definePlugin({ manifest: manifest() }), { code: 'MANIFEST_INVALID' });
  let reads = 0;
  const definition = { manifest: manifest(), get activate() { reads++; return () => {}; } };
  assert.throws(() => definePlugin(definition), { code: 'MANIFEST_INVALID' });
  assert.equal(reads, 0);
});

test('canonical identity survives independently evaluated SDK token modules', async () => {
  const copyUrl = new URL('./tokens.js?independent-copy', import.meta.resolve('@lunaris/sdk'));
  const copy = await import(copyUrl.href);
  const duplicate = copy.defineApi({ ...metadata, validate: () => true });
  assert.notEqual(api, duplicate);
  assert.equal(contractKey(api), copy.contractKey(duplicate));
  assert.doesNotThrow(() => assertCompatibleTokens(api, duplicate));
  assert.equal(contractKey(api), 'api:example.greeting@1.0.0');
  assert.notEqual(contractKey(defineEvent(metadata)), contractKey(api));
  assert.notEqual(contractKey(defineHook(metadata)), contractKey(api));
  assert.notEqual(contractKey(defineApi({ ...metadata, version: '2.0.0' })), contractKey(api));
  assert.notEqual(contractKey(defineApi({ ...metadata, version: '1.0.0+build.1' })), contractKey(api));
});

test('metadata checks are stateless and reject conflicts in either direction', () => {
  const restricted = defineApi({ ...metadata, consumePermission: 'example.read' });
  for (const [a, b] of [[api, restricted], [restricted, api]]) {
    assert.throws(() => assertCompatibleTokens(a, b), { code: 'CONTRACT_METADATA_CONFLICT' });
  }
  assert.doesNotThrow(() => assertCompatibleTokens(restricted, defineApi({ ...metadata, consumePermission: 'example.read' })));
  assert.doesNotThrow(() => assertCompatibleTokens(api, defineApi(metadata)));
  assert.throws(() => { api.version = '2.0.0'; }, TypeError);
});

for (const invalid of [
  { id: 'invalid' }, { version: 'v1.0.0' }, { version: '1.0' },
  { consumePermission: 'example.*' }, { providePermission: undefined },
  { validate: true }, { kind: 'event' },
]) {
  test(`rejects malformed token metadata ${JSON.stringify(invalid)}`, () => {
    assert.throws(() => defineApi({ ...metadata, ...invalid }), { code: 'CONTRACT_METADATA_CONFLICT' });
  });
}

test('declarations enforce exact provides, compatible requirements, and optional intent', () => {
  assert.doesNotThrow(() => assertDeclaration(manifest(provide), api, 'provide'));
  assert.doesNotThrow(() => assertDeclaration(manifest(requireApi), api, 'require'));
  assert.throws(() => assertDeclaration(manifest(), api, 'provide'), { code: 'CONTRACT_UNDECLARED' });
  assert.throws(() => assertDeclaration(manifest(provide), defineApi({ ...metadata, version: '1.0.1' }), 'provide'), { code: 'CONTRACT_UNDECLARED' });
  assert.throws(() => assertDeclaration(manifest(requireApi), defineEvent(metadata), 'require'), { code: 'CONTRACT_UNDECLARED' });
  assert.throws(() => assertDeclaration(manifest(requireApi), defineApi({ ...metadata, version: '2.0.0' }), 'require'), { code: 'CONTRACT_UNDECLARED' });
  const optional = manifest({ requires: [{ ...requireApi.requires[0], optional: true }] });
  assert.doesNotThrow(() => assertDeclaration(optional, api, 'optional'));
  assert.doesNotThrow(() => assertDeclaration(optional, api, 'consume'));
  assert.throws(() => assertDeclaration(optional, api, 'require'), { code: 'CONTRACT_UNDECLARED' });
  assert.throws(() => assertDeclaration(manifest(requireApi), api, 'optional'), { code: 'CONTRACT_UNDECLARED' });
  assert.throws(() => assertDeclaration(manifest({ version: 'broken' }), api, 'provide'), { code: 'MANIFEST_INVALID' });
});

test('permission declarations are checked independently for providers and consumers', () => {
  const restricted = defineApi({ ...metadata, providePermission: 'example.serve', consumePermission: 'example.read' });
  assert.throws(() => assertDeclaration(manifest(provide), restricted, 'provide'), { code: 'PERMISSION_DENIED' });
  assert.throws(() => assertDeclaration(manifest(requireApi), restricted, 'require'), { code: 'PERMISSION_DENIED' });
  assert.doesNotThrow(() => assertDeclaration(manifest({ ...provide, permissions: ['example.serve'] }), restricted, 'provide'));
  assert.doesNotThrow(() => assertDeclaration(manifest({ ...requireApi, optionalPermissions: ['example.read'] }), restricted, 'require'));
  // Passing declaration checks is not a runtime host grant.
});

test('runtime errors carry immutable safe context and a separately retained cause', () => {
  const context = { pluginId: 'example.plugin' };
  const cause = new Error('fixture');
  const error = new LunarisError('ACTIVATION_FAILED', 'Activation failed.', context, { cause });
  context.pluginId = 'example.changed';
  assert.equal(error.context.pluginId, 'example.plugin');
  assert.ok(Object.isFrozen(error.context));
  assert.equal(error.cause, cause);
});

test('declaration caches trust factory provenance and keep roles and mutable input defensive', () => {
  const known = definePlugin({ manifest: manifest(provide), activate() {} }).manifest;
  assertDeclaration(known, api, 'provide'); assertDeclaration(known, api, 'provide');
  assert.throws(() => assertDeclaration(known, api, 'consume'), { code: 'CONTRACT_UNDECLARED' });
  const mutable = manifest(provide);
  assertDeclaration(mutable, api, 'provide'); mutable.provides = [];
  assert.throws(() => assertDeclaration(mutable, api, 'provide'), { code: 'CONTRACT_UNDECLARED' });
  const raw = { ...api }; assertDeclaration(known, raw, 'provide'); raw.version = '2.0.0';
  assert.throws(() => assertDeclaration(known, raw, 'provide'), { code: 'CONTRACT_UNDECLARED' });
  const shallow = Object.freeze(manifest(provide)); assertDeclaration(shallow, api, 'provide');
  shallow.provides.length = 0;
  assert.throws(() => assertDeclaration(shallow, api, 'provide'), { code: 'CONTRACT_UNDECLARED' });
});
