import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { useBrowser } from '../../../../tools/test/browser.mjs';
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { Strikethrough } from '@lezer/markdown';
import { livePreview } from '../dist/src/live-preview.js';

function setup(doc) {
  const dom = useBrowser(new JSDOM('<div id="editor"></div>', { pretendToBeVisual: true }));
  Object.defineProperty(globalThis, 'MutationObserver', { configurable: true, value: dom.window.MutationObserver });
  Object.defineProperty(globalThis, 'Window', { configurable: true, value: dom.window.Window });
  const view = new EditorView({ parent: dom.window.document.querySelector('#editor'), state: EditorState.create({
    doc, extensions: [markdown({ extensions: [Strikethrough] }), livePreview, EditorState.allowMultipleSelections.of(true)],
  }) });
  return { view, close() { view.destroy(); dom.window.close(); } };
}
function hidden(view) {
  const result = [];
  view.plugin(livePreview).decorations.between(0, view.state.doc.length, (from, to, decoration) => {
    if (decoration.spec.widget === undefined && decoration.spec.class === undefined) result.push(view.state.sliceDoc(from, to));
  });
  return result;
}

test('inline syntax reveals only the selected constructs, including every secondary cursor', t => {
  const doc = 'start\n\n**bold** and *italic* and ~~gone~~ and `code` and [label](https://example.com "title")';
  const s = setup(doc);
  t.after(() => s.close());
  assert.deepEqual(hidden(s.view), ['**', '**', '*', '*', '~~', '~~', '`', '`', '[', '](https://example.com "title")']);
  s.view.dispatch({ selection: EditorSelection.create([
    EditorSelection.cursor(doc.indexOf('bold') + 1), EditorSelection.cursor(doc.indexOf('italic') + 1),
  ]) });
  assert.deepEqual(hidden(s.view), ['~~', '~~', '`', '`', '[', '](https://example.com "title")']);
  assert.equal(s.view.state.doc.toString(), doc);
  s.view.dispatch({ selection: { anchor: 0, head: doc.length } });
  assert.deepEqual(hidden(s.view), []);
});

test('parser respects escaped syntax, nested marks, code, images and HTML', t => {
  const doc = 'start\n\n\\*literal\\* **outer *inner*** `**code**`\n\n```md\n**literal**\n```\n\n![alt](file.png)\n\n<div>**html**</div>';
  const s = setup(doc);
  t.after(() => s.close());
  assert.deepEqual(hidden(s.view), ['**', '*', '*', '**', '`', '`']);
  assert.equal(s.view.dom.querySelector('img[src]'), null);
  assert.equal(s.view.dom.querySelector('script'), null);
  assert.equal(s.view.state.sliceDoc(), doc);
});

test('block markers remain editable and decorations react to edits without changing source', t => {
  const s = setup('start\n\n# Heading\n\n> quote\n\n- bullet\n\n1. numbered\n\n- [x] task\n\n---');
  t.after(() => s.close());
  assert.ok(s.view.dom.querySelector('.cm-preview-h1'));
  assert.ok(s.view.dom.querySelector('.cm-preview-bullet'));
  assert.ok(s.view.dom.querySelector('.cm-preview-quote'));
  assert.ok(s.view.dom.querySelector('.cm-preview-rule'));
  assert.ok(s.view.dom.textContent.includes('1. numbered'));
  assert.ok(s.view.dom.textContent.includes('- [x] task'));
  s.view.dispatch({ selection: { anchor: s.view.state.doc.toString().indexOf('bullet') } });
  assert.equal(s.view.dom.querySelector('.cm-preview-bullet'), null);
  s.view.dispatch({ changes: { from: 7, to: 8, insert: '##' }, selection: { anchor: 0 } });
  assert.ok(s.view.dom.querySelector('.cm-preview-h2'));
});

test('quote rails cover consecutive, empty, lazy and nested lines while source markers reveal', t => {
  const doc = 'start\n\n> first\n> second\n>\n> paragraph\nlazy continuation\n> > nested\n\noutside';
  const s = setup(doc);
  t.after(() => s.close());
  const quoted = () => [...s.view.dom.querySelectorAll('.cm-line.cm-preview-quote')];
  assert.equal(quoted().length, 6);
  assert.ok(quoted().every(line => line.style.backgroundImage.includes('linear-gradient')));
  assert.equal(quoted().at(-1).style.getPropertyValue('--cm-preview-quote-depth'), '2');
  assert.equal(s.view.dom.textContent.includes('│'), false);
  assert.ok(!s.view.dom.querySelector('.cm-preview-quote .cm-preview-quote'));
  s.view.dispatch({ selection: { anchor: doc.indexOf('second') } });
  assert.equal(quoted().length, 6);
  assert.ok(quoted()[1].textContent.startsWith('> second'));
  assert.equal(s.view.state.doc.toString(), doc);
  assert.equal([...s.view.dom.querySelectorAll('.cm-line')].at(-1).classList.contains('cm-preview-quote'), false);
});

test('inline code retains its presentation when delimiters reveal for editing', t => {
  const doc = 'start\n\n`some code`';
  const s = setup(doc);
  t.after(() => s.close());
  assert.equal(s.view.dom.querySelector('.cm-preview-code').textContent, 'some code');
  s.view.dispatch({ selection: { anchor: doc.indexOf('code') } });
  assert.equal(s.view.dom.querySelector('.cm-preview-code').textContent, '`some code`');
  assert.equal(s.view.state.doc.toString(), doc);
});
