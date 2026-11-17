import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestKernel } from '@lunaris/test';
import { definePlugin } from '@lunaris/sdk';
import { Logger } from '@lunaris/logging';
import { Vault, VaultChanged } from '@lunaris/vault';
import { Filesystem, FilesystemObservation, FileChanged, filesystemMethods } from '@lunaris/filesystem';
import { DocumentContent, DocumentContentChanged } from '@lunaris/active-document';
import { Backlinks, BacklinksChanged, NoteLinks, NoteLinksChanged } from '@lunaris/backlinks';
import plugin from '../dist/src/index.js';

const ok = value => ({ok:true,value});
const fail = code => ({ok:false,error:{code,message:code}});
const flush = async () => { for(let i=0;i<5;i++) await new Promise(setImmediate); };
async function setup(additional = []) {
  const kernel=createTestKernel(); const files=new Map([['note.md','---\naliases: [Idea]\n---\nNote'],['source.md','[[note]] Idea'], ...additional]);
  const buffers=new Map(); let root={id:'a',name:'A'}; let events; let api; let links; let nextRead; let deny=false; let watches=0;
  const notifications = { backlinks: 0, paths: 0 };
  const work = { lists: [], stats: [], reads: [] };
  const resetWork = () => { for (const paths of Object.values(work)) paths.length = 0; };
  const fileInfo = path => ({ path, kind: 'file', size: files.get(path).length, modifiedAt: 1 });
  kernel.installMock(Logger,Object.fromEntries(['log','debug','info','warn','error'].map(name=>[name,()=>true])));
  kernel.installMock(Vault,{current:()=>root,open:async()=>ok(root),close:async()=>ok(null)});
  kernel.installMock(Filesystem,{...Object.fromEntries(filesystemMethods.map(name=>[name,async()=>fail('UNSUPPORTED')])),
    async list({path}) {
      work.lists.push(path);
      if (deny) return fail('ACCESS_DENIED');
      const prefix = path ? path + '/' : '';
      const children = new Map();
      for (const file of files.keys()) if (file.startsWith(prefix)) {
        const [name, ...nested] = file.slice(prefix.length).split('/');
        const child = prefix + name;
        children.set(child, nested.length ? { path: child, kind: 'directory', size: 0, modifiedAt: 1 } : fileInfo(child));
      }
      return path && !children.size ? fail('NOT_FOUND') : ok([...children.values()]);
    },
    async stat({path}) { work.stats.push(path); return files.has(path) ? ok(fileInfo(path)) : fail('NOT_FOUND'); },
  });
  kernel.installMock(FilesystemObservation,{async watch(target,owner){watches++;owner.addEventListener('abort',()=>watches--,{once:true});return ok('watch');}});
  kernel.installMock(DocumentContent,{
    buffers:()=>[...buffers].map(([path,text])=>({target:{vaultId:root.id,path},text,version:'1'})),
    async read(target){work.reads.push(target.path);if(nextRead){const wait=nextRead;nextRead=undefined;await wait;}return files.has(target.path)?ok({text:buffers.get(target.path)??files.get(target.path),version:'1'}):fail('NOT_FOUND');},
    reveal:async()=>ok(null),
    async replace(target,range,insert,expected){const current=buffers.get(target.path)??files.get(target.path);if(current!==expected)return fail('CONFLICT');buffers.set(target.path,current.slice(0,range.from)+insert+current.slice(range.to));return ok(null);},
  });
  const metadata=(id,provides,requires)=>({manifestVersion:1,id,version:'0.1.0',engine:'^0.1.0',sdk:'^0.1.0',entry:'./index.js',provides,requires,permissions:['vault.access','filesystem.access'],optionalPermissions:[]});
  kernel.register(definePlugin({manifest:metadata('test.events',[VaultChanged,DocumentContentChanged,FileChanged].map(t=>({kind:'event',id:t.id,version:t.version})),[]),activate(ctx){events=ctx;}}));
  kernel.register(plugin);
  kernel.register(definePlugin({manifest:metadata('test.consumer',[],[Backlinks,BacklinksChanged,NoteLinks,NoteLinksChanged].map(t=>({kind:t.kind,id:t.id,range:'^'+t.version}))),activate(ctx){
    api=ctx.use(Backlinks); links=ctx.use(NoteLinks);
    ctx.events.on(BacklinksChanged, () => { notifications.backlinks++; });
    ctx.events.on(NoteLinksChanged, () => { notifications.paths++; });
  }}));
  for(const id of ['test.events','test.consumer',plugin.manifest.id])for(const permission of ['vault.access','filesystem.access'])kernel.grant(id,permission);
  await kernel.start('test.consumer');await api.refresh();await flush();
  resetWork();
  return {api,links,files,buffers,kernel,notifications,events,work,resetWork,deny:()=>{deny=true;},delay:promise=>{nextRead=promise;},
    async edit(path,text){buffers.set(path,text);await events.events.emit(DocumentContentChanged,{target:{vaultId:root.id,path}});},
    async change(kind, paths) { await events.events.emit(FileChanged, { vaultId: root.id, watchId: 'watch', kind, paths }); },
    async switchVault(){const previous=root;root={id:'b',name:'B'};files.clear();buffers.clear();await events.events.emit(VaultChanged,{kind:'switched',previous,current:root});},
    async stop(){await kernel.stopAll();kernel.assertNoResources();assert.equal(watches,0);assert.ok(!kernel.diagnostics().some(d=>d.code==='CLEANUP_FAILED'));},
  };
}
const target={vaultId:'a',path:'note.md'};
test('live aliases, exclusions, stale edits, deletes and degraded scans',async()=>{
  const s=await setup();try{
    let result=s.api.query(target);assert.equal(result.state,'ready');assert.equal(result.linked.length,1);assert.equal(result.unlinked.length,1);
    assert.equal(s.api.query(target,['source.md']).unlinked.length,0);assert.equal(s.api.query(target,['source.md']).linked.length,1);
    const source=result.unlinked[0];await s.edit('source.md','Idea changed');
    assert.equal((await s.api.link(target,source.source,source.mentions[0],source.text)).error.code,'CONFLICT');
    result=s.api.query(target);assert.equal(result.linked.length,0);assert.equal(result.unlinked.length,1);
    const fresh=result.unlinked[0];assert.equal((await s.api.link(target,fresh.source,fresh.mentions[0],fresh.text)).ok,true);
    assert.equal(s.api.query(target).linked.length,1);assert.equal(s.api.query(target).unlinked.length,0);
    s.files.delete('source.md');await s.api.refresh();assert.equal(s.api.query(target).linked.length,0);
    s.deny();await s.api.refresh();assert.equal(s.api.query(target).state,'degraded');
  }finally{await s.stop();}
});
test('a stale asynchronous scan cannot repopulate the next vault',async()=>{
  const s=await setup();try{
    let release;s.delay(new Promise(resolve=>release=resolve));const refreshing=s.api.refresh();await flush();
    await s.switchVault();release();await refreshing;await s.api.refresh();
    assert.equal(s.api.query(target).linked.length,0);assert.equal(s.api.query({vaultId:'b',path:'note.md'}).linked.length,0);
  }finally{await s.stop();}
});

test('content changes reuse unchanged source results and preserve catalog subscribers', async () => {
  const s = await setup();
  try {
    const before = s.api.query(target);
    const paths = s.notifications.paths;
    await s.edit('note.md', '---\naliases: [Idea]\n---\nNote edited');
    const after = s.api.query(target);
    assert.equal(after.linked[0], before.linked[0], 'typing the target does not recompute unchanged incoming links');
    assert.equal(after.unlinked[0], before.unlinked[0], 'unchanged aliases reuse source mentions');
    assert.equal(s.notifications.paths, paths, 'text invalidations must not refresh missing-link decorations');
    await s.edit('note.md', '---\naliases: [Other]\n---\nNote edited');
    assert.equal(s.api.query(target).unlinked.length, 0, 'alias changes recompute unlinked mentions');
    const backlinks = s.notifications.backlinks;
    s.buffers.set('source.md', '[[note]] fresh');
    assert.equal(s.api.query(target).linked[0].text, '[[note]] fresh');
    await s.events.events.emit(DocumentContentChanged, { target: { vaultId: 'a', path: 'source.md' } });
    assert.equal(s.notifications.backlinks, backlinks + 1, 'an early query must not consume the content notification');
  } finally { await s.stop(); }
});

test('identical scans keep snapshots stable while path and completeness changes notify link views', async () => {
  const s = await setup();
  try {
    const snapshot = s.api.query(target);
    const before = { ...s.notifications };
    await s.api.refresh();
    assert.equal(s.api.query(target), snapshot);
    assert.deepEqual(s.notifications, before);
    s.files.set('new.md', '[[note]]');
    await s.api.refresh();
    assert.equal(s.notifications.paths, before.paths + 1);
    assert.equal(s.api.query(target).linked.length, 2);
    s.files.delete('new.md');
    await s.api.refresh();
    assert.equal(s.notifications.paths, before.paths + 2);
    assert.equal(s.api.query(target).linked.length, 1);
    s.deny(); await s.api.refresh();
    assert.equal(s.notifications.paths, before.paths + 3, 'an incomplete listing invalidates missing-link certainty');
    assert.equal(s.api.query(target).state, 'degraded');
  } finally { await s.stop(); }
});

test('a modified known note reads once and retains unrelated mentions without listing directories', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const s = await setup([['other/nested/untouched.md', '[[note]]']]);
  try {
    const untouched = s.api.query(target).linked.find(group => group.source.path.startsWith('other/'));
    const catalogNotifications = s.notifications.paths;
    s.files.set('source.md', '[[note]] Fresh');
    await s.change('modified', ['source.md', 'source.md']);
    t.mock.timers.tick(180); await flush();
    assert.deepEqual(s.work, { lists: [], stats: ['source.md'], reads: ['source.md'] });
    const snapshot = s.api.query(target);
    assert.equal(snapshot.linked.find(group => group.source.path === 'source.md').text, '[[note]] Fresh');
    assert.equal(snapshot.linked.find(group => group.source.path.startsWith('other/')), untouched);
    assert.equal(s.notifications.paths, catalogNotifications);

    const notifications = { ...s.notifications };
    await s.change('modified', ['source.md']);
    t.mock.timers.tick(180); await flush();
    assert.equal(s.api.query(target), snapshot);
    assert.deepEqual(s.notifications, notifications);
  } finally { await s.stop(); }
});

test('a targeted read that finishes after switching Vault cannot publish old entries', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const s = await setup();
  const blocked = Promise.withResolvers();
  try {
    s.files.set('source.md', '[[note]] Old Vault');
    s.delay(blocked.promise);
    await s.change('modified', ['source.md']);
    t.mock.timers.tick(180); await flush();
    assert.deepEqual(s.work.reads, ['source.md']);

    await s.switchVault(); await flush();
    const notifications = { ...s.notifications };
    blocked.resolve(); await flush();
    assert.deepEqual(s.notifications, notifications);
    assert.deepEqual(s.api.query({ vaultId: 'b', path: 'note.md' }).linked, []);

    s.files.set('note.md', 'New Vault'); s.files.set('different.md', '[[note]]');
    t.mock.timers.tick(180); await flush();
    assert.deepEqual(s.api.query({ vaultId: 'b', path: 'note.md' }).linked.map(group => group.source.path), ['different.md']);
  } finally { blocked.resolve(); await s.stop(); }
});

test('folder moves, deletions and nested creations reconcile only affected branches', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const s = await setup([['before/child/moved.md', '[[note]]'], ['unrelated/skipped.md', '[[note]]']]);
  try {
    const catalogNotifications = s.notifications.paths;
    const links = s.links.parse('[[before/child/moved]] [[after/child/moved]] [[new/nested/created]]');
    const present = index => !s.links.missingTargets(target, links).includes(links[index].from);
    assert.deepEqual([present(0), present(1), present(2)], [true, false, false]);

    s.files.set('after/child/moved.md', s.files.get('before/child/moved.md'));
    s.files.delete('before/child/moved.md');
    await s.change('renamed', ['before', 'after']);
    t.mock.timers.tick(180); await flush();
    assert.deepEqual(s.work, { lists: ['', 'after', 'after/child'], stats: [], reads: ['after/child/moved.md'] });
    assert.deepEqual([present(0), present(1)], [false, true]);
    assert.equal(s.notifications.paths, catalogNotifications + 1);

    s.resetWork(); s.files.delete('after/child/moved.md');
    await s.change('removed', ['after']);
    t.mock.timers.tick(180); await flush();
    assert.deepEqual(s.work, { lists: [''], stats: [], reads: [] });
    assert.equal(present(1), false);

    s.resetWork(); s.files.set('new/nested/created.md', '[[note]]');
    await s.change('created', ['new/nested/created.md']);
    await s.change('created', ['new/nested']);
    t.mock.timers.tick(180); await flush();
    assert.deepEqual(s.work, { lists: ['', 'new', 'new/nested'], stats: [], reads: ['new/nested/created.md'] });
    assert.equal(present(2), true);
    assert.deepEqual(s.api.query(target).linked.map(group => group.source.path).sort(), ['new/nested/created.md', 'source.md', 'unrelated/skipped.md']);
  } finally { await s.stop(); }
});

test('a disappeared parent falls back to a full directory reconciliation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const s = await setup([['folder/first.md', '[[note]]'], ['folder/sibling.md', '[[note]]'], ['other/untouched.md', '[[note]]']]);
  try {
    s.files.delete('folder/first.md'); s.files.delete('folder/sibling.md');
    await s.change('removed', ['folder/first.md']);
    t.mock.timers.tick(180); await flush();
    assert.deepEqual(s.work, { lists: ['folder', '', 'other'], stats: [], reads: [] });
    const snapshot = s.api.query(target);
    assert.equal(snapshot.state, 'ready');
    assert.deepEqual(snapshot.linked.map(group => group.source.path).sort(), ['other/untouched.md', 'source.md']);
  } finally { await s.stop(); }
});

test('ambiguous watch changes and explicit rescans recheck the whole catalog', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const s = await setup([['folder/original.md', '[[note]]']]);
  try {
    s.files.delete('folder/original.md');
    s.files.set('other/renamed.md', '[[note]]');
    await s.change('renamed', ['folder/original.md']);
    t.mock.timers.tick(180); await flush();
    assert.deepEqual(s.work, { lists: ['', 'other'], stats: [], reads: ['note.md', 'source.md', 'other/renamed.md'] });
    assert.ok(s.api.query(target).linked.some(group => group.source.path === 'other/renamed.md'));

    s.resetWork(); s.files.set('other/renamed.md', '((note))');
    await s.change('rescan', []);
    t.mock.timers.tick(180); await flush();
    assert.deepEqual(s.work, { lists: ['', 'other'], stats: [], reads: ['note.md', 'source.md', 'other/renamed.md'] });
    assert.deepEqual(s.api.query(target).linked.map(group => group.source.path), ['source.md']);
  } finally { await s.stop(); }
});
