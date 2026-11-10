import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectLup, packLup, validLupPath, LUP_LIMITS } from '@lunaris/lup';
const encode = text => new TextEncoder().encode(text);
const manifest = () => ({ manifestVersion: 1, id: 'example.plugin', version: '1.0.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './plugin.js', metadata: { name: 'Example', author: 'Author', description: 'Plugin', platforms: 'universal', languages: ['en'] }, provides: [], requires: [], permissions: [], optionalPermissions: [] });
const entries = () => [{ path: 'manifest.json', data: encode(JSON.stringify(manifest())) }, { path: 'plugin.js', data: encode('throw Error("must never execute during preview")') }];

test('pack and inspect are deterministic, inert and bind preview to immutable exact bytes', () => {
  const source = entries(); const bytes = packLup(source); const result = inspectLup(bytes);
  assert.equal(result.manifest.id, 'example.plugin'); assert.equal(result.digest.length, 64);
  assert.deepEqual(packLup(source.toReversed()), bytes);
  bytes.fill(0); source[1].data.fill(0);
  const copy = result.read('plugin.js'); copy.fill(0);
  assert.match(new TextDecoder().decode(result.read('plugin.js')), /must never execute/);
  const archive = result.bytes(); archive.fill(0);
  assert.equal(inspectLup(result.bytes()).digest, result.digest);
  assert.ok(Object.isFrozen(result.paths));
});

test('portable file-only paths reject traversal, aliases, devices and file/directory conflicts', () => {
  for (const path of ['../a', '/a', 'a//b', './a', 'C:/a', 'a\\b', 'a:stream', 'a/%2e', 'a.', 'a/CON.txt', 'NUL', 'a\0b', 'a/é', 'a/../b']) assert.equal(validLupPath(path), false, path);
  for (const path of ['plugin.js', 'assets/icon-1.png', '.hidden/value.json']) assert.equal(validLupPath(path), true, path);
  for (const extra of [[{ path: 'PLUGIN.js', data: encode('x') }], [{ path: 'plugin.js', data: encode('x') }], [{ path: 'plugin.js/file', data: encode('x') }]]) assert.throws(() => packLup([...entries(), ...extra]), { code: 'LUP_PATH' });
});

test('rejects malformed, truncated, oversized, unsupported and trailing-byte containers', () => {
  const bytes = packLup(entries());
  for (const length of [0, 4, 7, 9, bytes.length - 1]) assert.throws(() => inspectLup(bytes.slice(0, length)));
  const wrongVersion = bytes.slice(); wrongVersion[3] = 2; assert.throws(() => inspectLup(wrongVersion), { code: 'LUP_INVALID' });
  const trailing = new Uint8Array(bytes.length + 1); trailing.set(bytes); assert.throws(() => inspectLup(trailing), { code: 'LUP_INVALID' });
  const count = bytes.slice(); new DataView(count.buffer).setUint32(4, 0xffffffff, true); assert.throws(() => inspectLup(count), { code: 'LUP_LIMIT' });
  const expansion = bytes.slice(); new DataView(expansion.buffer).setUint32(10, 0xffffffff, true); assert.throws(() => inspectLup(expansion), { code: 'LUP_LIMIT' });
  assert.throws(() => inspectLup(new Uint8Array(LUP_LIMITS.archiveBytes + 1)), { code: 'LUP_LIMIT' });
});

test('manifest metadata, entry existence, compatibility and identity are inspected before evaluation', () => {
  const invalid = manifest(); delete invalid.metadata;
  assert.throws(() => packLup([{ path: 'manifest.json', data: encode(JSON.stringify(invalid)) }, entries()[1]]), { code: 'LUP_MANIFEST' });
  invalid.metadata = manifest().metadata; invalid.entry = './absent.js';
  assert.throws(() => packLup([{ path: 'manifest.json', data: encode(JSON.stringify(invalid)) }, entries()[1]]), { code: 'LUP_MANIFEST' });
  assert.throws(() => inspectLup(packLup(entries()), { engineVersion: '9.0.0', sdkVersion: '0.1.0' }), { code: 'LUP_MANIFEST' });
});

test('decoder rejects duplicate entries and hostile raw path bytes, independent of the encoder', () => {
  function raw(paths) {
    const arrays = paths.map(path => encode(path)); const bytes = new Uint8Array(8 + arrays.reduce((sum, path) => sum + 6 + path.length, 0));
    bytes.set([76, 85, 80, 1]); const view = new DataView(bytes.buffer); view.setUint32(4, paths.length, true); let offset = 8;
    for (const path of arrays) { view.setUint16(offset, path.length, true); offset += 6; bytes.set(path, offset); offset += path.length; }
    return bytes;
  }
  for (const paths of [['a', 'a'], ['A', 'a'], ['../a', 'b'], ['a', 'a/b']]) assert.throws(() => inspectLup(raw(paths)), { code: 'LUP_PATH' });
});
