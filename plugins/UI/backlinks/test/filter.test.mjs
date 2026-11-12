import test from 'node:test';
import assert from 'node:assert/strict';
import { filterGroups } from '../dist/src/filter.js';
const group=(path,text,modifiedAt)=>({source:{vaultId:'v',path},text,modifiedAt,mentions:[{from:0,to:text.length,line:1,contextFrom:0,contextTo:text.length}]});
const groups=[group('projects/Alpha.md','Hello world',2),group('notes/Beta.md','other context',1)];
test('phrases, negation, OR, path/file and regular expressions compose',()=>{
  for(const q of ['"hello world"','path:projects -other','file:Alpha','/hello/i']) assert.deepEqual(filterGroups(groups,q,'name').map(g=>g.source.path),['projects/Alpha.md']);
  assert.equal(filterGroups(groups,'hello OR other','name').length,2);
  assert.equal(filterGroups(groups,'/[/','name').length,0);
});
test('stable ordering and empty matches',()=>{
  assert.equal(filterGroups(groups,'','modified-desc')[0].source.path,'projects/Alpha.md');
  assert.equal(filterGroups(groups,'','modified-asc')[0].source.path,'notes/Beta.md');
  assert.equal(filterGroups(groups,'missing','name').length,0);
});
