import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNote, resolveLink, unlinked, mention } from '../dist/src/markdown.js';

test('wiki, embeds, anchors, Markdown and reference destinations resolve', () => {
  const note = parseNote('[[Note]] ![[Note#Heading|Alias]] [n](Note.md) [x](<A B.md>)\n[ref][n]\n\n[n]: Note.md');
  assert.deepEqual(note.links.map(l => l.destination).sort(), ['A B.md','Note','Note#Heading','Note.md','Note.md'].sort());
  const paths = ['Note.md','A B.md'];
  assert.equal(note.links.filter(l => resolveLink(l, 'source.md', paths) === 'Note.md').length, 4);
});
test('source relative paths, encoded names, heading/block references and duplicates', () => {
  const paths = ['Note.md','folder/Note.md','A B.md','folder/deep/Source.md'];
  const resolve = (destination, wiki = false) => resolveLink({destination,wiki}, 'folder/deep/Source.md', paths);
  assert.equal(resolve('../Note.md'), 'folder/Note.md');
  assert.equal(resolve('A%20B.md#heading'), 'A B.md');
  assert.equal(resolve('#^block', true), 'folder/deep/Source.md');
  assert.equal(resolve('Note',true), 'folder/Note.md');
  assert.equal(resolve('https://example.com/Note.md'),null);
  assert.equal(resolve('../../../Note.md'),null);
});
test('code, comments, metadata and existing links do not become plain mentions', () => {
  const note = parseNote('---\naliases:\n - AI\n - "Artificial intelligence"\n---\nAI and Artificial intelligence.\n\n`AI` [[AI]] [AI](AI.md)\n```md\nAI [[AI]]\n```\n<!-- AI --> %% AI %%\n    AI\n');
  assert.deepEqual(note.aliases,['AI','Artificial intelligence']);
  const matches = unlinked(note, note.aliases);
  assert.deepEqual(matches.map(m => note.text.slice(m.from,m.to)), ['AI','Artificial intelligence']);
  assert.equal(note.links.length,2);
});
test('Unicode word boundaries, overlapping aliases, case and UTF-16 offsets', () => {
  const note = parseNote('😀 Кот котик КОТ. AI artificial intelligence.');
  const result = unlinked(note,['Кот','AI','artificial','artificial intelligence']);
  assert.deepEqual(result.map(m=>note.text.slice(m.from,m.to)),['Кот','КОТ','AI','artificial intelligence']);
  assert.equal(result[0].from,3);
});
test('CRLF paragraph context and invalid metadata preserve indexing', () => {
  const text='First\r\n\r\nA Note here\r\ncontinued\r\n\r\nLast'; const result=mention(text,10,14);
  assert.equal(text.slice(result.contextFrom,result.contextTo),'A Note here\r\ncontinued');
  assert.equal(result.line,3);
  assert.equal(parseNote('---\naliases: [broken\n---\n[[Note]]').links.length,1);
});
test('escaped wikilinks and external links do not resolve', () => {
  assert.equal(parseNote('\\[[Note]]').links.length,0);
  assert.equal(resolveLink({destination:'//example.com/Note',wiki:false},'source.md',['Note.md']),null);
});
