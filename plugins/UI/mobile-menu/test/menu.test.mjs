import test from 'node:test';
import assert from 'node:assert/strict';
import { setupWorkspace, flush } from '../../../../tools/test/workspace.mjs';
test('mobile items validate, order, update, contain failures and follow contributor lifetime', async () => {
 const s=await setupWorkspace({mobileMenu:true});
 try {
  const api=s.tools.mobileMenu; const owner=s.ctx.scope.child(); let calls=0;
  assert.deepEqual(api.list(),[]);
  const item={id:'test.action',label:'Action',icon:'sidebar',onPress:()=>{calls++;}};
  assert.equal(api.register(item,owner.signal).ok,true);
  assert.equal(api.register(item,owner.signal).ok,false);
  assert.equal(api.register({...item,id:'bad'},owner.signal).ok,false);
  assert.equal(api.register({...item,id:'test.count',count:-1},owner.signal).ok,false);
  assert.equal(api.register({...item,id:'test.first',order:-1},owner.signal).ok,true);
  assert.deepEqual(api.list().map(x=>x.id),['test.first','test.action']);
  const stale=api.list()[1]; await stale.onPress(); assert.equal(calls,1);
  assert.equal(api.update({...item,count:0,disabled:true}).ok,true);
  assert.equal(api.list()[1].count,0);
  await api.list()[1].onPress(); await stale.onPress(); assert.equal(calls,1);
  assert.equal(api.update({...item,onPress:()=>{throw new Error('Action failure');}}).ok,true);
  await api.list()[1].onPress(); assert.ok(s.logs.some(log=>log[2]==='Mobile action failed'));
  await owner.dispose(); await flush(); assert.deepEqual(api.list(),[]);
  await stale.onPress(); assert.equal(calls,1);
 } finally {await s.stop();}
});
