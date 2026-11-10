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
  let host = await start(); const key = { writerId: 'first', server: 'https://notes.example', accountId: 'alice', vaultId: 'v', path: 'note.md' };
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

test('independent writers survive restart and acknowledge only their own revision',async()=>{
 const indexedDB=new IDBFactory(); const hosts=[];
 async function open(){let api;const host=testHost({'lunaris.browser-storage':['drafts.storage'],'test.consumer':['drafts.access']});hosts.push(host);host.register(createBrowserStorage({indexedDB,config:false}));host.register(consumer([DraftStorage],ctx=>{api=ctx.use(DraftStorage);},['drafts.access']));await host.start('test.consumer');return api;}
 const a=await open(),b=await open();const base={server:'https://s',accountId:'a',vaultId:'v',path:'note.md'};
 const first={key:{...base,writerId:'a'},text:'A',expectedVersion:'v1',revision:'a1',updatedAt:1};
 const second={key:{...base,writerId:'b'},text:'B',expectedVersion:'v1',revision:'b1',updatedAt:2};
 assert.equal((await a.save(first)).ok,true);assert.equal((await b.save(second)).ok,true);
 assert.deepEqual((await a.list(base)).value.map(r=>r.text).sort(),['A','B']);
 await b.remove(second.key,'b1');assert.equal((await a.load(first.key)).value.text,'A');
 await a.save({...first,text:'A newer',revision:'a2'});await b.remove(first.key,'a1');assert.equal((await a.load(first.key)).value.text,'A newer');
 for(const host of hosts)await host.stopAll();const restarted=await open();assert.equal((await restarted.list(base)).value[0].text,'A newer');
 for(const host of hosts){await host.stopAll();host.assertNoResources();}
});

test('schema upgrade retains legacy recovery and separates new writer records',async()=>{
 const indexedDB=new IDBFactory();const key={server:'https://s',accountId:'a',vaultId:'v',path:'legacy.md'};
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('lunaris-device-v1',1);r.onupgradeneeded=()=>{r.result.createObjectStore('files');r.result.createObjectStore('drafts');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put({key,text:'Legacy',expectedVersion:'v1',revision:'old',updatedAt:1},JSON.stringify([key.server,key.accountId,key.vaultId,key.path]));tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
 let api;const host=testHost({'lunaris.browser-storage':['drafts.storage'],'test.consumer':['drafts.access']});host.register(createBrowserStorage({indexedDB,config:false}));host.register(consumer([DraftStorage],ctx=>{api=ctx.use(DraftStorage);},['drafts.access']));await host.start('test.consumer');
 assert.equal((await api.list(key)).value[0].text,'Legacy');await api.save({key:{...key,writerId:'new'},text:'New',expectedVersion:'v1',revision:'new',updatedAt:2});
 assert.equal((await api.list(key)).value.length,2);await api.remove(key,'old');assert.equal((await api.list(key)).value[0].text,'New');await host.stopAll();host.assertNoResources();
});
