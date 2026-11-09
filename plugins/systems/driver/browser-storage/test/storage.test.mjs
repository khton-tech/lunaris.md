import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

test('HTTP-style storage without Web Crypto preserves SHA-256 versions and concurrent write conflicts', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {} });
  const indexedDB = new IDBFactory(); const hosts = [];
  async function start() {
    let files, ctx;
    const host = testHost({ 'lunaris.browser-storage': ['drafts.storage', 'filesystem.native'], 'test.consumer': ['filesystem.access'] });
    hosts.push(host); host.register(createBrowserStorage({ indexedDB }));
    host.register(consumer([LocalFilesystemBackend.api], context => { ctx = context; files = ctx.use(LocalFilesystemBackend.api); }, ['filesystem.access']));
    await host.start('test.consumer');
    const opened = await files.openConfig(ctx.signal); assert.equal(opened.ok, true);
    return { files, target: path => ({ vaultId: opened.value.id, path }) };
  }
  try {
    const first = await start(); const second = await start();
    for (const [index, bytes] of [[], [...new TextEncoder().encode('Привет\nconfig = "dark"')], [...Array(256).keys()]].entries()) {
      const filename = `config-${index}.toml`; const expected = createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
      const written = await first.files.writeFile(first.target(filename), bytes, { mode: 'create' });
      assert.deepEqual(written, { ok: true, value: { version: expected } });
      const read = await second.files.readFile(second.target(filename));
      assert.deepEqual(read, { ok: true, value: { data: bytes, version: expected } });
      const unchanged = await second.files.writeFile(second.target(filename), bytes, { mode: 'replace', expectedVersion: expected });
      assert.equal(unchanged.value.version, expected);
    }
    const filename = 'config-0.toml'; const version = (await first.files.readFile(first.target(filename))).value.version;
    const results = await Promise.all([
      first.files.writeText(first.target(filename), 'first update', { mode: 'replace', expectedVersion: version }),
      second.files.writeText(second.target(filename), 'other update', { mode: 'replace', expectedVersion: version }),
    ]);
    assert.equal(results.filter(result => result.ok).length, 1);
    assert.equal(results.find(result => !result.ok).error.code, 'CONFLICT');
  } finally {
    for (const host of hosts) { await host.stopAll(); host.assertNoResources(); assert.deepEqual(host.diagnostics(), []); }
    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor); else delete globalThis.crypto;
  }
});
