import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createTestKernel } from '@lunaris/test';
import { definePlugin } from '@lunaris/sdk';
import { Logger } from '@lunaris/logging';
import { Components, ComponentsChanged } from '@lunaris/components';
import { ContextMenu } from '@lunaris/context-menu';
import provider from '@lunaris/context-menu-provider';

async function setup() {
  const kernel = createTestKernel({ initialGrants: { 'lunaris.context-menu-provider': ['ui.dom'] } });
  const logs = []; let api; let ctx; let view; let disposed = 0;
  kernel.installMock(Logger, Object.fromEntries(['log', 'debug', 'info', 'warn', 'error'].map(level => [level, (...args) => { logs.push([level, ...args]); return true; }])));
  kernel.installMock(Components, { register() {}, has: () => true, list: () => [], mount(id, target, props) {
    view = { id, target, props }; return { ok: true, value: { componentId: id, update() {}, dispose() { disposed++; } } };
  } }, { grants: ['ui.dom'] });
  kernel.register(definePlugin({ manifest: { manifestVersion: 1, id: 'test.events', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides: [{kind:'event',id:ComponentsChanged.id,version:ComponentsChanged.version}], requires: [], permissions: [], optionalPermissions: [] }, activate() {} }));
  kernel.register(provider);
  kernel.register(definePlugin({ manifest: { manifestVersion: 1, id: 'test.consumer', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './index.js', provides: [], requires: [{kind:'api', id:ContextMenu.id,range:'^1.0.0'}], permissions: [], optionalPermissions: [] }, activate(context) { ctx = context; api = ctx.use(ContextMenu); } }));
  await kernel.start('test.consumer');
  return { kernel, get api() { return api; }, get ctx() { return ctx; }, logs, get view() { return view; }, get disposed() { return disposed; }, async stop() { await kernel.stopAll(); kernel.assertNoResources(); assert.deepEqual(kernel.diagnostics(), []); } };
}
const context = { source: 'lunaris.file-explorer', target: 'file', data: { vaultId: 'a', path: 'note.md' } };
const action = (id, run = () => {}, extra = {}) => ({ kind: 'action', id, label: id, run, ...extra });

test('contributions filter by origin, nest folders, sort, hide empty folders and freeze snapshots', async () => {
  const s = await setup(); let seen;
  s.api.register({ id:'test.tools', build: ctx => { seen = ctx; return ctx.target === 'file' ? [{ kind:'group', id:'test.folder', label:'Tools', children:[action('test.later',undefined,{order:2}), action('test.first',undefined,{order:1})] },{kind:'group',id:'test.empty',label:'Empty',children:[]}] : []; } }, s.ctx.signal);
  const menu = s.api.resolve(context,s.ctx.signal); assert.equal(menu.ok,true);
  assert.equal(menu.value.items.length,1); assert.deepEqual(menu.value.items[0].children.map(x=>x.id),['test.first','test.later']);
  assert.equal(seen.source, context.source); assert.equal(seen.data.path,'note.md'); assert.ok(Object.isFrozen(seen.data)); assert.ok(Object.isFrozen(menu.value.items[0].children));
  assert.equal(s.api.resolve({...context,target:'background'},s.ctx.signal).value.items.length,0);
  await s.stop();
});

test('one-shot execution retains invocation context and rejects disabled, removed and expired commands', async () => {
  const s = await setup(); const owner=s.ctx.scope.child(); let calls=0;
  const registration=s.api.register({id:'test.actions',build:()=>[action('test.run',ctx=>{assert.equal(ctx.data.path,'note.md');calls++}),{kind:'group',id:'test.disabled',label:'Disabled',disabled:true,children:[action('test.child',()=>calls++)]}]},owner.signal);
  let menu=s.api.resolve(context,s.ctx.signal).value;
  assert.equal((await menu.execute('test.child')).error.code,'UNAVAILABLE'); assert.equal(calls,0);
  assert.equal((await menu.execute('test.run')).ok,true); assert.equal((await menu.execute('test.run')).error.code,'UNAVAILABLE'); assert.equal(calls,1);
  menu=s.api.resolve(context,s.ctx.signal).value;registration.value.dispose();assert.equal((await menu.execute('test.run')).error.code,'UNAVAILABLE');
  const local=s.api.resolve(context,owner.signal,[action('test.local',()=>calls++)]).value;await owner.dispose();assert.equal((await local.execute('test.local')).error.code,'UNAVAILABLE');
  await s.stop();
});

test('invalid trees and callback failures preserve original diagnostics; shutdown rejects retained sessions', async () => {
  const s=await setup();const error=new Error('Original failure');
  assert.equal(s.api.register({id:'bad'},s.ctx.signal).error.code,'INVALID_ARGUMENT');
  s.api.register({id:'test.bad',build:()=>{throw error}},s.ctx.signal);
  assert.equal(s.api.resolve(context,s.ctx.signal).error.code,'BUILD_FAILED');
  assert.ok(s.logs.some(log=>log[0]==='error'&&log[3].error===error));
  await s.kernel.stop('test.consumer');await s.kernel.start('test.consumer');
  // Old consumer registrations are removed automatically.
  assert.equal(s.api.resolve(context,s.ctx.signal,[action('same'),action('same')]).error.code,'BUILD_FAILED');
  const failed=s.api.resolve(context,s.ctx.signal,[action('test.failure',()=>{throw error})]).value;
  assert.equal((await failed.execute('test.failure')).error.code,'ACTION_FAILED');
  const stale=s.api.resolve(context,s.ctx.signal,[action('test.stale')]).value;await s.stop();
  assert.equal((await stale.execute('test.stale')).error.code,'UNAVAILABLE');
});

test('opening owns an overlay, replaces the previous opening and releases on owner cancellation', async () => {
  const s=await setup();const dom=new JSDOM('<button>Source</button>');const target=dom.window.document.querySelector('button');const owner=s.ctx.scope.child();
  const request={target,x:32,y:48,label:'Actions',context,entries:[action('test.local')]};
  const first=s.api.open(request,owner.signal);assert.equal(first.ok,true);assert.equal(s.view.id,'lunaris.context-menu');assert.equal(s.view.props.x,32);
  assert.ok(s.view.target.isConnected);assert.equal(dom.window.document.querySelectorAll('[data-lunaris-context-menu]').length,1);
  s.api.open(request,owner.signal);assert.equal((await first.value.execute('test.local')).error.code,'UNAVAILABLE');assert.equal(s.disposed,1);
  await owner.dispose();assert.equal(s.disposed,2);assert.equal(dom.window.document.querySelector('[data-lunaris-context-menu]'),null);
  dom.window.close();await s.stop();
});
