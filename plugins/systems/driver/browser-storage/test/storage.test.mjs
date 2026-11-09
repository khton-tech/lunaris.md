import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createBrowserStorage } from '@lunaris/browser-storage';
import { DraftStorage } from '@lunaris/remote';
import { LocalFilesystemBackend } from '@lunaris/filesystem';
import { testHost, consumer } from '../../../../../tools/testing/remote.mjs';

test('IndexedDB drafts survive driver restart and stale acknowledgements preserve newer edits', async () => {
  const indexedDB = new IDBFactory(); let storage, files, ctx;
  async function start() {
    const host = testHost({ 'lunaris.browser-storage': ['drafts.storage', 'filesystem.native'], 'test.consumer': ['drafts.access', 'filesystem.access'] });
    host.register(createBrowserStorage({ indexedDB }));
    host.register(consumer([DraftStorage, LocalFilesystemBackend.api], context => { ctx = context; storage = ctx.use(DraftStorage); files = ctx.use(LocalFilesystemBackend.api); }, ['drafts.access', 'filesystem.access']));
    await host.start('test.consumer'); return host;
  }
  let host = await start(); const key = { server: 'https://notes.example', accountId: 'alice', vaultId: 'v', path: 'note.md' };
  assert.equal((await storage.save({ key, text: 'first', expectedVersion: 'v1', revision: 'r1', updatedAt: 1 })).ok, true);
  await storage.save({ key, text: 'newer', expectedVersion: 'v1', revision: 'r2', updatedAt: 2 });
  await storage.remove(key, 'r1'); assert.equal((await storage.load(key)).value.text, 'newer');
  assert.equal((await storage.load({ ...key, accountId: 'bob' })).value, null);
  const root = (await files.openConfig(ctx.signal)).value;
  const write = await files.writeText({ vaultId: root.id, path: 'config.toml' }, 'theme="dark"', { mode: 'create' }); assert.equal(write.ok, true);
  assert.equal((await files.writeText({ vaultId: root.id, path: 'config.toml' }, 'attack', { mode: 'replace', expectedVersion: 'stale' })).error.code, 'CONFLICT');
  await host.stopAll(); host.assertNoResources(); host = await start();
  assert.equal((await storage.load(key)).value.revision, 'r2'); await storage.remove(key, 'r2'); assert.equal((await storage.load(key)).value, null);
  const reopened = (await files.openConfig(ctx.signal)).value;
  assert.equal((await files.readText({ vaultId: reopened.id, path: 'config.toml' })).value.text, 'theme="dark"');
  await host.stopAll(); host.assertNoResources(); assert.deepEqual(host.diagnostics(), []);
});
