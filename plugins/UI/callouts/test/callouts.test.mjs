import test from 'node:test';
import assert from 'node:assert/strict';
import { parser } from '@lezer/markdown';
import { EditorState, EditorSelection } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { calloutMarkdown, readHeader, calloutTypes } from '../dist/src/markdown.js';
import { calloutPreview, presentation, toggleCallout } from '../dist/src/preview.js';
const parse=source=>parser.configure(calloutMarkdown).parse(source).toString();
const controls={available:true,title:type=>type,toggleLabel:'Toggle',editLabel:'Edit',active:()=>true,mount:()=>null,toggled(){}};
function fixture(source){return EditorState.create({doc:source,extensions:[markdown({extensions:[calloutMarkdown]}),calloutPreview,presentation.of(controls),EditorState.allowMultipleSelections.of(true)]});}
function blocks(state){const result=[];state.field(calloutPreview).decorations.between(0,state.doc.length,(from,to,value)=>{if(value.spec.block)result.push([from,to]);});return result;}
test('standard types, aliases, case, titles, unknown fallback and malformed syntax',()=>{
  for(const type of calloutTypes)assert.equal(readHeader(`[!${type.toUpperCase()}]+ Title`).type,type);
  for(const [alias,type] of Object.entries({summary:'abstract',tldr:'abstract',hint:'tip',important:'tip',check:'success',done:'success',help:'question',faq:'question',caution:'warning',attention:'warning',fail:'failure',missing:'failure',error:'danger',cite:'quote'}))assert.equal(readHeader(`[!${alias}]`).type,type);
  assert.equal(readHeader('[!custom-type]- Custom').type,'note');assert.equal(readHeader('[!tip] Title').title,'Title');
  for(const s of ['[!tip','[!tip]oops','[!]','\\[!tip]','[!tip]++'])assert.equal(readHeader(s),null);
});
test('composite parsing preserves nesting, lists, fences, escapes and ordinary quotes',()=>{
  const tree=parse('> [!info] Title\n> **Bold**\n>\n> - [ ] task\n>\n> > [!tip]\n> > nested\n>\n> ```js\n> const x=1\n> ```');
  assert.match(tree,/CalloutHeader/);assert.equal((tree.match(/Callout\(/g)||[]).length,2);assert.match(tree,/BulletList/);assert.match(tree,/FencedCode/);
  for(const s of ['```\n> [!note]\n```','    > [!note]','\\> [!note]','> \\[!note]','> [!note','> ordinary'])assert.doesNotMatch(parse(s),/Callout\(/);
  assert.match(parse('> ordinary'),/Blockquote/);
});
test('folds preserve source, reveal secondary selections, map after edits and reset on marker change',()=>{
  const source='Start\n\n> [!tip]- Title\n> Body\n\nEnd';let state=fixture(source);assert.equal(blocks(state).length,1);
  const from=source.indexOf('[!tip]');state=state.update({effects:toggleCallout.of({from,collapsed:false})}).state;assert.equal(blocks(state).length,0);
  state=state.update({changes:{from:0,insert:'Prefix\n'}}).state;assert.equal(blocks(state).length,0);
  state=state.update({effects:toggleCallout.of({from:from+7,collapsed:true})}).state;assert.equal(blocks(state).length,1);
  const body=state.doc.toString().indexOf('Body');state=state.update({selection:EditorSelection.create([EditorSelection.cursor(0),EditorSelection.cursor(body)])}).state;assert.equal(blocks(state).length,0);
  state=state.update({selection:{anchor:0}}).state;assert.equal(blocks(state).length,1);
  assert.equal(state.doc.toString(),'Prefix\n'+source);
  const minus=state.doc.toString().indexOf(']-')+1;state=state.update({changes:{from:minus,to:minus+1,insert:'+'}}).state;assert.equal(blocks(state).length,0);
});
test('missing UIKit leaves bodies and editable title syntax available',()=>{
 let state=fixture('Start\n\n> [!tip]- Title\n> Body');state=state.update({effects:[]}).state;
 const missing=EditorState.create({doc:state.doc,extensions:[markdown({extensions:[calloutMarkdown]}),calloutPreview,presentation.of({...controls,available:false})]});assert.equal(blocks(missing).length,0);
});

import { continueCallout } from '../dist/src/commands.js';
test('Enter continues callout quotes, ordered/task lists and fences; empty lines exit one level',()=>{
  const examples=[['> [!note] Title','> [!note] Title\n> '],['> [!note]\n> Body','> [!note]\n> Body\n> '],['> [!note]\n> - [x] item','> [!note]\n> - [x] item\n> - [ ] '],['> [!note]\n> 2. item','> [!note]\n> 2. item\n> 3. '],['> [!note]\n> - ','> [!note]\n> '],['> [!note]\n> ','> [!note]\n'],['> [!note]\n> ```\n>   code','> [!note]\n> ```\n>   code\n>   ']];
  for(const [source,expected] of examples){let state=fixture(source);state=state.update({selection:{anchor:state.doc.length}}).state;assert.equal(continueCallout({state,dispatch(tr){state=tr.state;}}),true,source);assert.equal(state.doc.toString(),expected);}
  const state=fixture('Ordinary text');assert.equal(continueCallout({state,dispatch(){throw Error('Unexpected edit');}}),false);
});
