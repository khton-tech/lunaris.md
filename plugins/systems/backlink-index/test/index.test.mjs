import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestKernel } from '@lunaris/test';
import { definePlugin } from '@lunaris/sdk';
import { Logger } from '@lunaris/logging';
import { Vault, VaultChanged } from '@lunaris/vault';
import { Filesystem, FilesystemObservation, FileChanged, filesystemMethods } from '@lunaris/filesystem';
import { DocumentContent, DocumentContentChanged } from '@lunaris/active-document';
import { Backlinks, BacklinksChanged } from '@lunaris/backlinks';
import plugin from '../dist/src/index.js';

const ok = value => ({ok:true,value});
const fail = code => ({ok:false,error:{code,message:code}});
const flush = async () => { for(let i=0;i<5;i++) await new Promise(setImmediate); };
async function setup() {
  const kernel=createTestKernel(); const files=new Map([['note.md','---\naliases: [Idea]\n---\nNote'],['source.md','[[note]] Idea']]);
  const buffers=new Map(); let root={id:'a',name:'A'}; let events; let api; let nextRead; let deny=false; let watches=0;
  kernel.installMock(Logger,Object.fromEntries(['log','debug','info','warn','error'].map(name=>[name,()=>true])));
  kernel.installMock(Vault,{current:()=>root,open:async()=>ok(root),close:async()=>ok(null)});
  kernel.installMock(Filesystem,{...Object.fromEntries(filesystemMethods.map(name=>[name,async()=>fail('UNSUPPORTED')])),
    list:async()=>deny?fail('ACCESS_DENIED'):ok([...files].map(([path,text])=>({path,kind:'file',size:text.length,modifiedAt:1}))),
  });
  kernel.installMock(FilesystemObservation,{async watch(target,owner){watches++;owner.addEventListener('abort',()=>watches--,{once:true});return ok('watch');}});
  kernel.installMock(DocumentContent,{
    buffers:()=>[...buffers].map(([path,text])=>({target:{vaultId:root.id,path},text,version:'1'})),
    async read(target){if(nextRead){const wait=nextRead;nextRead=undefined;await wait;}return files.has(target.path)?ok({text:buffers.get(target.path)??files.get(target.path),version:'1'}):fail('NOT_FOUND');},
    reveal:async()=>ok(null),
    async replace(target,range,insert,expected){const current=buffers.get(target.path)??files.get(target.path);if(current!==expected)return fail('CONFLICT');buffers.set(target.path,current.slice(0,range.from)+insert+current.slice(range.to));return ok(null);},
  });
  const metadata=(id,provides,requires)=>({manifestVersion:1,id,version:'0.1.0',engine:'^0.1.0',sdk:'^0.1.0',entry:'./index.js',provides,requires,permissions:['vault.access','filesystem.access'],optionalPermissions:[]});
  kernel.register(definePlugin({manifest:metadata('test.events',[VaultChanged,DocumentContentChanged,FileChanged].map(t=>({kind:'event',id:t.id,version:t.version})),[]),activate(ctx){events=ctx;}}));
  kernel.register(plugin);
  kernel.register(definePlugin({manifest:metadata('test.consumer',[],[Backlinks,BacklinksChanged].map(t=>({kind:t.kind,id:t.id,range:'^'+t.version}))),activate(ctx){api=ctx.use(Backlinks);}}));
  for(const id of ['test.events','test.consumer',plugin.manifest.id])for(const permission of ['vault.access','filesystem.access'])kernel.grant(id,permission);
  await kernel.start('test.consumer');await api.refresh();await flush();
  return {api,files,buffers,kernel,deny:()=>{deny=true;},delay:promise=>{nextRead=promise;},
    async edit(path,text){buffers.set(path,text);await events.events.emit(DocumentContentChanged,{target:{vaultId:root.id,path}});},
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
