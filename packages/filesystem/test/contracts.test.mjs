import test from 'node:test';
import assert from 'node:assert/strict';
import { Filesystem, FileChanged, validPath, filesystemMethods } from '@lunaris/filesystem';

test('portable paths are canonical, relative and safe for Windows aliases', () => {
  for (const path of ['note.md', 'notes/Привет.md', '.config/settings.json']) assert.equal(validPath(path), true);
  assert.equal(validPath('', true), true); assert.equal(validPath(''), false);
  for (const path of ['/root', 'C:/root', '../note', 'a/../b', 'a//b', './note', 'a\\b', 'note:stream', 'CON', 'con.md', 'NUL.txt', 'LPT1.md', 'note.', 'note ', 'a\n.md']) assert.equal(validPath(path, true), false, path);
});
test('API shape and filesystem change payloads are validated at SDK boundaries', () => {
  assert.equal(Filesystem.validate(Object.fromEntries(filesystemMethods.map(name => [name, () => {}]))), true);
  assert.equal(Filesystem.validate({ readText() {} }), false);
  assert.equal(FileChanged.validate({ vaultId: 'v', watchId: 'w', kind: 'modified', paths: ['notes/a.md'] }), true);
  assert.equal(FileChanged.validate({ vaultId: 'v', watchId: 'w', kind: 'modified', paths: ['../a'] }), false);
});
