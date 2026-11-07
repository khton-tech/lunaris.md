import test from 'node:test';
import assert from 'node:assert/strict';
import { parser } from '@lezer/markdown';
import { tabIndentedLists } from '../dist/src/markdown.js';

const markdown = parser.configure(tabIndentedLists);

test('deep tab-indented siblings share a list and retain inline parsing', () => {
  const tree = markdown.parse('\t\t\t\t- **First**\n\t\t\t\t- *Second*');
  const lists = [];
  tree.iterate({ enter(node) { if (node.name === 'BulletList') lists.push(node.node); } });
  assert.equal(lists.length, 1);
  assert.equal(lists[0].getChildren('ListItem').length, 2);
  assert.ok(tree.toString().includes('StrongEmphasis'));
  assert.ok(tree.toString().includes('Emphasis'));
  assert.ok(!tree.toString().includes('CodeBlock'));
});

test('skipped tab levels interrupt a parent paragraph and remain list content', () => {
  const tree = markdown.parse('- **Parent**\n\t\t\t- Child\n\t\t\t- Sibling');
  const lists = [];
  tree.iterate({ enter(node) { if (node.name === 'BulletList') lists.push(node.node); } });
  assert.equal(lists.length, 2);
  assert.equal(lists[1].getChildren('ListItem').length, 2);
  assert.ok(tree.toString().includes('StrongEmphasis'));
  assert.ok(!tree.toString().includes('CodeBlock'));
});

test('ordinary indented code, space-indented code and fenced examples remain literal', () => {
  for (const text of ['\tplain code', '    - code example']) {
    const tree = markdown.parse(text).toString();
    assert.ok(tree.includes('CodeBlock')); assert.ok(!tree.includes('ListItem'));
  }
  const tree = markdown.parse('```md\n\t\t- literal\n```').toString();
  assert.ok(tree.includes('FencedCode')); assert.ok(!tree.includes('ListItem'));
});
