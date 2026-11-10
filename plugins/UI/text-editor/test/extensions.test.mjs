import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { useBrowser } from '../../../../tools/test/browser.mjs';
import { EditorState, Facet } from '@codemirror/state';
import { undo } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import { createExtensions } from '../dist/src/extensions.js';
import { mountEditor } from '../dist/src/codemirror.js';

test('registry validates IDs, sorts contributions and releases owners independently', () => {
  const provider = new AbortController(), a = new AbortController(), b = new AbortController();
  let changes = 0;
  const registry = createExtensions(provider.signal, () => changes++);
  assert.equal(registry.api.register({id:'', extension:[]},a.signal).error.code,'INVALID_ARGUMENT');
  const first = registry.api.register({id:'z',extension:[]},a.signal);
  assert.equal(first.ok,true);
  assert.equal(registry.api.register({id:'z',extension:[]},b.signal).error.code,'ALREADY_REGISTERED');
  registry.api.register({id:'a',extension:[]},b.signal);
  assert.deepEqual(registry.current().map(x=>x.id),['a','z']);
  a.abort(); first.value.dispose(); assert.deepEqual(registry.current().map(x=>x.id),['a']);
  assert.equal(changes,3); provider.abort(); assert.equal(registry.current().length,0);
  assert.equal(registry.api.register({id:'x',extension:[]},b.signal).error.code,'CANCELLED');
});

test('live adapter adds/removes contributions without replacing view, text, selection or undo history', t => {
  const dom=useBrowser(new JSDOM('<div id="editor"></div>',{pretendToBeVisual:true}));
  globalThis.MutationObserver=dom.window.MutationObserver;globalThis.Window=dom.window.Window;
  const session={text:'hello\r\n@@word@@',locks:0,missing:false,loading:false,recoveryCandidates:[],edit(text){this.text=text;}};
  const adapter=mountEditor(document.querySelector('#editor'),session,undefined,null,'Editor',()=>{},error=>{throw error;});
  t.after(()=>{adapter.dispose();dom.window.close();});
  const original=adapter.view;
  original.dispatch({changes:{from:0,to:5,insert:'Hello'},selection:{anchor:3}});
  const before=session.text;
  const facet=Facet.define({combine: values=>values[0] ?? 0});
  const extension={id:'sample',extension:facet.of(7),markdown:{defineNodes:['Sample'],parseInline:[{name:'Sample',parse(cx,next,pos){if(next!==64 || cx.slice(pos,pos+2)!=='@@')return -1;const end=cx.slice(pos+2,cx.end).indexOf('@@');return end<0 ? -1 : cx.addElement(cx.elt('Sample',pos,pos+end+4));}}]}};
  adapter.update(null,'Editor',true,undefined,[extension]);
  assert.equal(adapter.view,original);assert.equal(original.state.facet(facet),7);
  assert.equal(session.text,before);assert.equal(original.state.selection.main.head,3);
  assert.match(syntaxTree(original.state).toString(),/Sample/);
  adapter.update(null,'Editor',true,undefined,[]);
  assert.equal(original.state.facet(facet),0);assert.equal(session.text,before);
  assert.doesNotMatch(syntaxTree(original.state).toString(),/Sample/);
  assert.equal(undo(original),true);assert.equal(session.text,'hello\r\n@@word@@');
  const next=mountEditor(document.createElement('div'),session,undefined,null,'Editor',()=>{},()=>{},true,undefined,undefined,undefined,[extension]);
  assert.equal(next.view.state.facet(facet),7);next.dispose();
});
