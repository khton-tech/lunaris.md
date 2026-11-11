import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackups } from '../dist/backups.js';

const ok = value => ({ ok: true, value });
const fail = code => ({ ok: false, error: { code, message: code } });
const data = '.lunaris/plugins/data/example.plugin'; const backupRoot = '.lunaris/plugins/backups/example.plugin/u-one';
const code = 'a'.repeat(64);
function fixture() {
  const files = new Map(); const directories = new Set(); const symlinks = new Set(); const removed = []; const configCalls = [];
  let settings = 'old-settings'; let failRestoreWrite = false;
  const info = path => ({ path, kind: symlinks.has(path) ? 'symlink' : directories.has(path) ? 'directory' : 'file', size: files.get(path)?.length ?? 0, modifiedAt: null });
  const fs = {
    async stat(target) { assert.equal(target.vaultId, 'captured'); return files.has(target.path) || directories.has(target.path) || symlinks.has(target.path) ? ok(info(target.path)) : fail('NOT_FOUND'); },
    async list({ path }) { return ok([...new Set([...directories, ...files.keys(), ...symlinks])].filter(name => name.startsWith(path + '/') && !name.slice(path.length + 1).includes('/')).map(info)); },
    async createDirectory({ path }, recursive) { if (!recursive && directories.has(path)) return fail('ALREADY_EXISTS'); directories.add(path); return ok(null); },
    async readFile({ path }) { return files.has(path) ? ok({ data: Array.from(files.get(path)), version: '1' }) : fail('NOT_FOUND'); },
    async writeFile({ path }, bytes, options) { if (failRestoreWrite && path.startsWith(data + '/')) return fail('IO_ERROR'); if (options.mode === 'create' && files.has(path)) return fail('ALREADY_EXISTS'); files.set(path, new Uint8Array(bytes)); return ok({ version: '1' }); },
    async readText(target) { const result = await fs.readFile(target); return result.ok ? ok({ text: new TextDecoder().decode(new Uint8Array(result.value.data)), version: '1' }) : result; },
    async writeText(target, text, options) { return fs.writeFile(target, new TextEncoder().encode(text), options); },
    async remove({ path }) { removed.push(path); for (const name of [...files.keys()]) if (name === path || name.startsWith(path + '/')) files.delete(name); for (const name of [...directories]) if (name === path || name.startsWith(path + '/')) directories.delete(name); return ok(null); },
  };
  const config = {
    async capture(id, target) { configCalls.push(['capture', id, target]); return ok(settings); },
    async restore(id, text, target) { configCalls.push(['restore', id, target]); settings = text; return ok(null); },
  };
  return { backups: createBackups(fs, config, 'captured'), files, directories, symlinks, removed, configCalls, settings: value => { if (value !== undefined) settings = value; return settings; }, failWrites: value => { failRestoreWrite = value; } };
}

test('managed-data backup restores files, empty directories and settings while preserving arbitrary documents', async () => {
  const f = fixture(); f.directories.add(data); f.directories.add(`${data}/empty`); f.files.set(`${data}/model.bin`, new Uint8Array([0,255,1])); f.files.set('document.md', new Uint8Array([7]));
  const digest = await f.backups.create('example.plugin', 'u-one', code);
  f.files.set(`${data}/model.bin`, new Uint8Array([9])); f.files.set(`${data}/new.bin`, new Uint8Array([8])); f.settings('candidate-settings');
  await f.backups.restore('example.plugin', 'u-one', code, digest);
  assert.deepEqual([...f.files.get(`${data}/model.bin`)], [0,255,1]); assert.equal(f.files.has(`${data}/new.bin`), false); assert.ok(f.directories.has(`${data}/empty`));
  assert.equal(f.settings(), 'old-settings'); assert.deepEqual([...f.files.get('document.md')], [7]);
  assert.deepEqual(f.configCalls.map(call => call[2]), [{ scope: 'vault', vaultId: 'captured' }, { scope: 'vault', vaultId: 'captured' }]);
  await f.backups.discard('example.plugin', 'u-one'); assert.equal(f.files.has(`${backupRoot}/manifest.json`), false); assert.ok(f.files.has(`${data}/model.bin`));
});

test('absent managed-data root is restored as absent', async () => {
  const f = fixture(); const digest = await f.backups.create('example.plugin', 'u-one', code);
  f.directories.add(data); f.files.set(`${data}/candidate`, new Uint8Array([9]));
  await f.backups.restore('example.plugin', 'u-one', code, digest); assert.equal(f.directories.has(data), false); assert.equal(f.files.has(`${data}/candidate`), false);
});

test('backup integrity is validated before changing settings or deleting candidate data', async () => {
  const f = fixture(); f.directories.add(data); f.files.set(`${data}/value`, new Uint8Array([1]));
  const digest = await f.backups.create('example.plugin', 'u-one', code); f.settings('candidate-settings'); f.files.set(`${data}/value`, new Uint8Array([2]));
  f.files.set(`${backupRoot}/data/value`, new Uint8Array([3]));
  await assert.rejects(f.backups.restore('example.plugin', 'u-one', code, digest), /integrity/);
  assert.equal(f.settings(), 'candidate-settings'); assert.deepEqual([...f.files.get(`${data}/value`)], [2]); assert.deepEqual(f.removed, []);
  await assert.rejects(f.backups.restore('example.plugin', 'u-one', code, 'b'.repeat(64)), /integrity/);
});

test('failed data restoration is retryable from the same intact backup', async () => {
  const f = fixture(); f.directories.add(data); f.files.set(`${data}/value`, new Uint8Array([1]));
  const digest = await f.backups.create('example.plugin', 'u-one', code); f.files.set(`${data}/value`, new Uint8Array([2])); f.failWrites(true);
  await assert.rejects(f.backups.restore('example.plugin', 'u-one', code, digest), /restore managed-data file/);
  assert.ok(f.files.has(`${backupRoot}/manifest.json`)); f.failWrites(false);
  await f.backups.restore('example.plugin', 'u-one', code, digest); assert.deepEqual([...f.files.get(`${data}/value`)], [1]);
});

test('backup creation refuses symlinks and cannot reuse an existing committed backup', async () => {
  const f = fixture(); f.directories.add(data); f.symlinks.add(`${data}/outside`);
  await assert.rejects(f.backups.create('example.plugin', 'u-one', code), /symlinks/); assert.equal(f.files.has(`${backupRoot}/manifest.json`), false);
  f.symlinks.clear(); await f.backups.create('example.plugin', 'u-one', code);
  await assert.rejects(f.backups.create('example.plugin', 'u-one', code), /already exists/); assert.ok(f.files.has(`${backupRoot}/manifest.json`));
  await assert.rejects(f.backups.discard('example.plugin', '../outside'), /identity/); await assert.rejects(f.backups.discard('../outside', 'u-one'), /identity/);
});
