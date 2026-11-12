import test from 'node:test';
import assert from 'node:assert/strict';
import { anchorRange } from '../dist/src/anchor.js';
import { parseNote } from '../dist/src/markdown.js';
test('heading and block navigation preserves CRLF offsets and ignores fenced code',()=>{
  const text='```md\r\n## Heading\r\n```\r\n## Heading\r\nA paragraph ^block';
  const heading=anchorRange(text,'Note#heading');assert.equal(text.slice(heading.from,heading.to),'## Heading');assert.equal(heading.from,text.lastIndexOf('## Heading'));
  const block=anchorRange(text,'Note#^block');assert.equal(text.slice(block.from,block.to),'A paragraph ^block');
  assert.equal(anchorRange(text,'Note#missing'),null);assert.deepEqual(anchorRange(text,'Note'),{from:0,to:0});
});
test('bare URLs, angle autolinks and Markdown destinations are recognized outside code',()=>{
  const note=parseNote('https://example.com <https://example.org> [web](https://example.net) `https://code.test`');
  assert.deepEqual(note.links.map(link=>link.destination).sort(),['https://example.com','https://example.org','https://example.net'].sort());
});
