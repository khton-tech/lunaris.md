import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../dist/storage.js';

const root = '.lunaris/plugins/packages';
const digest = 'a'.repeat(64); const stale = 'b'.repeat(64);
const record = { id: 'example.plugin', version: '1.0.0', digest, enabled: true, recoveryRequired: false };
const info = (path, kind = 'file') => ({ path, kind, size: 1, modifiedAt: null });
const ok = value => ({ ok: true, value });
const missing = () => ({ ok: false, error: { code: 'NOT_FOUND', message: 'Missing' } });
function fixture(records = [record]) {
  let version = '1'; let onList = () => {}; const removed = [];
  const listing = new Map([
    [root, [info(`${root}/example.plugin`, 'directory'), info(`${root}/example.abandoned`, 'directory'), info(`${root}/outside`, 'symlink')]],
    [`${root}/example.plugin`, [info(`${root}/example.plugin/${digest}.lup`), info(`${root}/example.plugin/${stale}.lup`), info(`${root}/example.plugin/README.md`), info(`${root}/example.plugin/${'c'.repeat(64)}.lup`, 'symlink'), info('.lunaris/plugins/data/example.plugin/file')]],
    [`${root}/example.abandoned`, [info(`${root}/example.abandoned/${stale}.lup`)]],
  ]);
  const fs = {
    async readText(target) { assert.equal(target.vaultId, 'captured'); return ok({ text: JSON.stringify({ formatVersion: 1, revision: 1, plugins: records }), version }); },
    async list(target) { assert.equal(target.vaultId, 'captured'); onList(); return listing.has(target.path) ? ok(listing.get(target.path)) : missing(); },
    async remove(target, recursive) { assert.equal(target.vaultId, 'captured'); assert.equal(recursive, false); removed.push(target.path); return ok(null); },
  };
  return { storage: createStorage(fs, 'captured'), removed, listing, changeOnList() { onList = () => { version = 'changed'; }; } };
}

test('archive sweep retains committed/tombstoned code and ignores unrelated data and symlinks', async () => {
  const f = fixture(); const records = await f.storage.read();
  assert.equal(await f.storage.cleanup(records), 2);
  assert.deepEqual(f.removed, [`${root}/example.plugin/${stale}.lup`, `${root}/example.abandoned/${stale}.lup`]);
  const removing = fixture([{ ...record, enabled: false, recoveryRequired: true, removing: { deleteData: false } }]);
  assert.equal(await removing.storage.cleanup(await removing.storage.read()), 2);
  assert.ok(!removing.removed.includes(`${root}/example.plugin/${digest}.lup`));
});

test('archive sweep refuses observed registry conflicts and does not delete before a committed registry exists', async () => {
  const f = fixture(); const records = await f.storage.read(); f.changeOnList();
  await assert.rejects(f.storage.cleanup(records), /registry changed/); assert.deepEqual(f.removed, []);
  const unopened = fixture(); assert.equal(await unopened.storage.cleanup([]), 0); assert.deepEqual(unopened.removed, []);
});

test('archive sweep bounds traversal before deleting any candidate', async () => {
  const f = fixture(); const records = await f.storage.read();
  f.listing.set(`${root}/example.plugin`, new Array(4097).fill(info(`${root}/example.plugin/${stale}.lup`)));
  await assert.rejects(f.storage.cleanup(records), /entry limit/); assert.deepEqual(f.removed, []);
});
